# NexQ Context Intelligence — PRD

> **Feature**: Context-Aware AI Response System
> **Scope**: Local RAG (Phase 1) + Gemini Context Caching (Phase 2)
> **Version**: 1.0.0 | **Date**: March 19, 2026
> **Author**: Vahid Alizadeh
> **Status**: Ready for Implementation

---

## 1. Overview

### 1.1 Problem Statement

NexQ provides real-time AI-assisted responses during meetings. When the user presses Space, the app must generate a contextual response that considers:

- **Static context**: Resume, job description, technical notes, custom instructions (uploaded before meeting)
- **Dynamic context**: Live transcript, detected questions, prior AI responses (generated during meeting)

Sending the full context to the LLM on every Space press is:

- **Slow**: 50K tokens adds ~1.5s prefill latency
- **Expensive**: 15 Space presses × 50K tokens × $0.30/MTok = $0.225/meeting on Gemini Flash (much worse on Claude/GPT)
- **Limited**: Cannot scale beyond the model's context window (typically 128K-1M tokens)

### 1.2 Solution

Two complementary context strategies, user-selectable in Settings:

| Strategy | Phase | How It Works | Best For |
|----------|-------|-------------|----------|
| **Local RAG** | Phase 1 | Embed documents locally (Ollama), search via sqlite-vec, send only relevant chunks to any LLM | Universal — works with all providers, free, private, unlimited docs |
| **Gemini Context Cache** | Phase 2 | Upload static context to Gemini once, cache server-side, reference by ID on each call | Gemini users wanting 100% accuracy at reduced cost |

### 1.3 Design Principles

- **Default Smart, Advanced Available**: Non-technical users get a one-click experience with sensible defaults. Power users can tune every parameter.
- **Provider Agnostic**: Local RAG works with Ollama, LM Studio, Groq, OpenAI, Anthropic, Gemini, OpenRouter, and Custom endpoints — all providers already in the app.
- **Phase 1 First**: Local RAG is the core feature. Gemini Cache is an enhancement. The UI for Phase 2 shows "Coming Soon" until implemented.
- **Transparent Costs**: Always show the user estimated token usage, cost impact, and RAG vs stuffing comparison.

---

## 2. Settings UI: Context Strategy Selection

### 2.1 New Settings Tab: "Context Strategy"

Add a new tab in the Settings sidebar between "LLM" and "STT Keys":

```
SETTINGS (sidebar)
├── Meeting Audio
├── LLM
├── Context Strategy    ← NEW
├── STT Keys
├── Hotkeys
├── General
└── About
```

### 2.2 Strategy Selector

At the top of the Context Strategy settings page, show a strategy selector similar to the existing LLM provider selector grid:

```
┌─────────────────────────────────────────────────────────────┐
│  CONTEXT STRATEGY                                           │
│                                                             │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │  ● Active               │  │                          │  │
│  │                         │  │                          │  │
│  │  🔍 Local RAG           │  │  ☁️ Gemini Cache         │  │
│  │  Embed & search locally │  │  Coming Soon             │  │
│  │  Works with all LLMs    │  │  Cache context on Gemini │  │
│  │                         │  │                          │  │
│  └─────────────────────────┘  └──────────────────────────┘  │
│                                                             │
│  Active: Local RAG                                          │
│  Documents are embedded locally using Ollama and searched   │
│  via sqlite-vec. Only relevant chunks are sent to your      │
│  selected LLM provider.                                     │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**

- Clicking a strategy card selects it and reveals its configuration section below.
- Phase 2 card (Gemini Cache) shows a "Coming Soon" badge and is not selectable until implemented.
- Selection is persisted to config store and takes effect immediately (no app restart needed).

---

## 3. Phase 1: Local RAG

### 3.1 Architecture

```
User adds file in Context Panel
  │
  ▼
┌──────────────────────────────────────────────────────┐
│ FILE PROCESSING PIPELINE (Rust, background thread)   │
│                                                      │
│  1. Extract text                                     │
│     PDF → pdf-extract crate                          │
│     DOCX → basic XML extraction                      │
│     TXT/MD → read directly                           │
│                                                      │
│  2. Chunk text                                       │
│     RecursiveCharacterTextSplitter                   │
│     Configurable: chunk_size, chunk_overlap           │
│     Respects: sentence boundaries, paragraph breaks  │
│                                                      │
│  3. Generate embeddings                              │
│     HTTP POST to Ollama /api/embed                   │
│     Model: nomic-embed-text (768 dimensions)         │
│     Batched: up to 32 chunks per request             │
│                                                      │
│  4. Store in sqlite-vec                              │
│     Same rusqlite DB as meetings                     │
│     Vector index for ANN search                      │
│     FTS5 index for keyword search                    │
└──────────────────────────────────────────────────────┘
          │
          │ (on Space press)
          ▼
┌──────────────────────────────────────────────────────┐
│ RETRIEVAL PIPELINE (Rust, on demand)                 │
│                                                      │
│  1. Take detected question + recent transcript       │
│                                                      │
│  2. Embed query via Ollama (~40ms)                   │
│                                                      │
│  3. Hybrid search:                                   │
│     a. sqlite-vec ANN search → top-K semantic        │
│     b. FTS5 keyword search → top-K keyword           │
│     c. Reciprocal Rank Fusion (RRF) merge            │
│                                                      │
│  4. Assemble prompt:                                 │
│     System instructions (~200 tokens)                │
│     + Top-N merged chunks (~2-3K tokens)             │
│     + Recent transcript (~1.5K tokens)               │
│     + Detected question (~100 tokens)                │
│     + Custom instructions (~200 tokens)              │
│     = ~4-5K total tokens                             │
│                                                      │
│  5. Send to active LLM provider (any)                │
│     Stream response back via IPC                     │
└──────────────────────────────────────────────────────┘
```

### 3.2 Settings UI: Local RAG Configuration

When "Local RAG" is selected as the active strategy, show the following configuration below the strategy selector. Settings are split into **Essential** (always visible) and **Advanced** (collapsed by default).

#### 3.2.1 Essential Settings (Always Visible)

```
┌─────────────────────────────────────────────────────────────┐
│  LOCAL RAG SETTINGS                                         │
│                                                             │
│  Embedding Model                                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  nomic-embed-text                              ▼   │    │
│  └─────────────────────────────────────────────────────┘    │
│  768 dimensions · 0.5GB RAM · Recommended for most users    │
│                                                             │
│  Ollama Status                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ● Connected (localhost:11434)                      │    │
│  │  Model: nomic-embed-text ✓ Pulled                   │    │
│  └─────────────────────────────────────────────────────┘    │
│  [ Test Connection ]  [ Pull Model ]                        │
│                                                             │
│  Results to Retrieve                                        │
│  ┌────────────────────────────────┐                         │
│  │  5 chunks                  ▼  │                         │
│  └────────────────────────────────┘                         │
│  Number of relevant chunks included in each AI prompt.      │
│  More = better context but slower & more tokens.            │
│                                                             │
│  Search Mode                                                │
│  ┌────────────────────────────────┐                         │
│  │  Hybrid (Semantic + Keyword) ▼│                         │
│  └────────────────────────────────┘                         │
│  Hybrid combines vector similarity with keyword matching    │
│  for best results.                                          │
│                                                             │
│  RAG Index Status                                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  3 files indexed · 47 chunks · 36,096 tokens        │    │
│  │  Last indexed: 2 minutes ago                        │    │
│  └─────────────────────────────────────────────────────┘    │
│  [ Rebuild Index ]  [ Clear Index ]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Field Specifications:**

| Field | Type | Default | Options | Description |
|-------|------|---------|---------|-------------|
| Embedding Model | Dropdown | `nomic-embed-text` | `nomic-embed-text`, `nomic-embed-text-v2-moe`, `mxbai-embed-large`, `all-minilm` | Ollama embedding model to use. Changing triggers re-index prompt. |
| Ollama Status | Read-only | Auto-detected | Connected / Disconnected / Model Missing | Shows connection to Ollama and whether the selected embedding model is available. |
| Results to Retrieve | Dropdown | `5` | `3`, `5`, `7`, `10`, `15`, `20` | Number of chunks returned by hybrid search (top-N after RRF merge). |
| Search Mode | Dropdown | `Hybrid` | `Hybrid (Semantic + Keyword)`, `Semantic Only`, `Keyword Only` | Search strategy. Hybrid recommended for best accuracy. |
| RAG Index Status | Read-only | Auto-updated | Shows file count, chunk count, total tokens, last index time | Live status of the vector index. |

**Actions:**

| Button | Behavior |
|--------|----------|
| Test Connection | Pings Ollama at configured URL. Shows success/failure toast. |
| Pull Model | Runs `ollama pull <model>` in background. Shows progress bar. |
| Rebuild Index | Re-extracts, re-chunks, and re-embeds all current context files. Shows progress bar with "Processing file 2/3..." |
| Clear Index | Deletes all embeddings from sqlite-vec. Prompts confirmation dialog. |

#### 3.2.2 Advanced Settings (Collapsed, Toggle to Show)

```
┌─────────────────────────────────────────────────────────────┐
│  ▶ Advanced RAG Settings                                    │
│                                                             │
│  ┌─── Chunking ─────────────────────────────────────────┐   │
│  │                                                      │   │
│  │  Chunk Size (tokens)                                 │   │
│  │  ├──────────────────────────────────────────┤ 512    │   │
│  │  Smaller = more precise retrieval, larger = more     │   │
│  │  context per chunk. Range: 128-2048.                 │   │
│  │                                                      │   │
│  │  Chunk Overlap (tokens)                              │   │
│  │  ├──────────────────────────────────────────┤ 64     │   │
│  │  Overlap between adjacent chunks to avoid cutting    │   │
│  │  sentences. Range: 0-512.                            │   │
│  │                                                      │   │
│  │  Splitting Strategy                                  │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  Recursive (paragraph → sentence → word)  ▼ │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── Search Tuning ────────────────────────────────────┐   │
│  │                                                      │   │
│  │  Similarity Threshold                                │   │
│  │  ├──────────────────────────────────────────┤ 0.3    │   │
│  │  Minimum cosine similarity to include a chunk.       │   │
│  │  Lower = more results (may include noise).           │   │
│  │  Range: 0.0-0.9. Set to 0 to disable.               │   │
│  │                                                      │   │
│  │  Semantic Weight (Hybrid Mode)                       │   │
│  │  ├──────────────────────────────────────────┤ 0.7    │   │
│  │  Balance between semantic and keyword results.       │   │
│  │  1.0 = pure semantic, 0.0 = pure keyword.            │   │
│  │  Range: 0.0-1.0.                                     │   │
│  │                                                      │   │
│  │  Include Transcript in RAG                           │   │
│  │  [✓] Index live transcript chunks during meeting     │   │
│  │  Enables searching past conversation context.        │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── Embedding Provider ───────────────────────────────┐   │
│  │                                                      │   │
│  │  Ollama URL                                          │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  http://localhost:11434                      │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │                                                      │   │
│  │  Batch Size                                          │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  32                                       ▼ │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │  Chunks per embedding request. Higher = faster       │   │
│  │  indexing but more RAM.                              │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [ Reset to Defaults ]                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Advanced Field Specifications:**

| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| Chunk Size | Slider | `512` | 128-2048 | Token count per chunk. 512 is optimal for most embedding models. |
| Chunk Overlap | Slider | `64` | 0-512 | Overlap between chunks. Prevents sentence splitting at boundaries. |
| Splitting Strategy | Dropdown | `Recursive` | `Recursive`, `Sentence`, `Fixed` | Recursive tries paragraph→sentence→word boundaries. Sentence splits on `.!?`. Fixed splits at exact token count. |
| Similarity Threshold | Slider | `0.3` | 0.0-0.9 | Minimum cosine similarity score. Chunks below this are excluded. 0 = return all top-N regardless of score. |
| Semantic Weight | Slider | `0.7` | 0.0-1.0 | RRF weight for semantic vs keyword results. Only visible when Search Mode = Hybrid. |
| Include Transcript in RAG | Checkbox | `true` | on/off | When enabled, transcript segments are chunked and embedded in real-time during the meeting. Enables "what did we discuss about X?" queries. |
| Ollama URL | Text input | `http://localhost:11434` | Valid URL | Endpoint for Ollama API. Change if running on a different machine/port. |
| Batch Size | Dropdown | `32` | `8`, `16`, `32`, `64` | Number of chunks embedded per Ollama API call. Higher = faster but uses more VRAM. |

### 3.3 Context Panel UI (Meeting Context Section on Launcher)

Update the existing Meeting Context section (shown in the uploaded screenshot) to reflect RAG status:

```
┌─────────────────────────────────────────────────────────────┐
│  📋 MEETING CONTEXT                                         │
│                                                             │
│  Strategy: Local RAG (nomic-embed-text)           [⚙️]      │
│                                                             │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │         ☁️ Drag files here                          │   │
│  │         PDF, TXT, DOCX, or Markdown                 │   │
│  │                                                     │   │
│  │              [ Browse Files ]                       │   │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                                             │
│  FILES (3)                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  📄 Resume_VahidAlizadeh.pdf      2.1K tokens       │    │
│  │     12 chunks · Indexed ✓          [⟲] [🗑️]        │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  📝 JD_SeniorSWE_Google.txt       1.4K tokens       │    │
│  │     8 chunks · Indexed ✓           [⟲] [🗑️]        │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  📎 SystemDesignNotes.md          8.2K tokens        │    │
│  │     27 chunks · Indexed ✓          [⟲] [🗑️]        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  RAG Index                                          │    │
│  │  ████████████████████████░░░░░░  47 chunks           │    │
│  │                                                     │    │
│  │  Estimated prompt size per query: ~4.2K tokens       │    │
│  │  (5 chunks + transcript + question)                 │    │
│  │                                                     │    │
│  │  [ Rebuild All ]  [ Test Search ]                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Custom Instructions                    0 chars · ~0 tokens │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Add custom instructions for AI responses...        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Token Budget                    11,900 / 128.0k (9%)       │
│  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  ● Context files: ~11.7K  ● System prompt: ~200             │
│                                                             │
│  Note: With RAG, only ~4-5K tokens are sent per query       │
│  regardless of total file size.                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Per-File Actions:**

| Icon | Action | Behavior |
|------|--------|----------|
| ⟲ | Re-index file | Re-extract, re-chunk, re-embed this file only. Useful if file was modified. |
| 🗑️ | Remove file | Remove file from context and delete its chunks/embeddings from sqlite-vec. Confirmation dialog. |

**Bottom Actions:**

| Button | Behavior |
|--------|----------|
| Rebuild All | Re-index all files. Shows progress: "Indexing file 2/3 (chunk 15/27)..." |
| Test Search | Opens a mini dialog where user can type a query and see which chunks would be retrieved. Shows: chunk text, source file, similarity score, rank. Useful for debugging retrieval quality. |

### 3.4 File Processing Pipeline

#### 3.4.1 Supported File Types

| Extension | Extraction Method | Notes |
|-----------|------------------|-------|
| `.pdf` | `pdf-extract` crate | Text extraction. Images/tables may lose formatting. |
| `.txt` | Direct read (UTF-8) | Cleanest input. |
| `.md` | Direct read (UTF-8) | Markdown formatting preserved in chunks (useful context for LLM). |
| `.docx` | Basic XML extraction | Extract `<w:t>` text from document.xml. Tables as tab-separated. |

#### 3.4.2 Chunking Algorithm

```
RecursiveCharacterTextSplitter {
    chunk_size: 512,         // tokens (configurable)
    chunk_overlap: 64,       // tokens (configurable)
    separators: [
        "\n\n",              // Double newline (paragraph break) — try first
        "\n",                // Single newline (line break)
        ". ",                // Sentence boundary
        "? ",                // Question boundary
        "! ",                // Exclamation boundary
        " ",                 // Word boundary — last resort
    ],
    length_function: token_count,  // Use tiktoken-rs or simple 4-char approximation
}
```

**Process:**

1. Try to split on the first separator that produces chunks ≤ `chunk_size`.
2. If a chunk exceeds `chunk_size`, recursively split with the next separator.
3. Apply `chunk_overlap` by including the last N tokens of the previous chunk at the start of the next.
4. Each chunk stores metadata: `{ source_file, chunk_index, start_char, end_char, token_count }`.

#### 3.4.3 Embedding Pipeline

```rust
// Pseudocode for embedding pipeline
async fn embed_chunks(chunks: Vec<Chunk>, config: &RagConfig) -> Result<()> {
    let batches = chunks.chunks(config.batch_size); // Default 32
    
    for batch in batches {
        let texts: Vec<String> = batch.iter()
            .map(|c| format!("search_document: {}", c.text)) // nomic-embed-text prefix
            .collect();
        
        // POST to Ollama /api/embed
        let response = ollama_client.embed(EmbedRequest {
            model: config.embedding_model.clone(), // "nomic-embed-text"
            input: texts,
        }).await?;
        
        // Store in sqlite-vec
        for (chunk, embedding) in batch.iter().zip(response.embeddings) {
            db.execute(
                "INSERT INTO rag_embeddings (id, file_id, chunk_index, text, embedding, metadata)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![chunk.id, chunk.file_id, chunk.index, chunk.text, 
                        embedding.as_bytes(), chunk.metadata_json()],
            )?;
        }
        
        // Emit progress event to UI
        emit("rag_index_progress", IndexProgress { 
            current: batch_idx, 
            total: batches.len(),
            file_name: current_file.name.clone(),
        });
    }
    Ok(())
}
```

#### 3.4.4 Live Transcript Indexing

When "Include Transcript in RAG" is enabled (default: true):

1. Every finalized transcript segment (after silence detection) is chunked.
2. Segments are grouped into chunks of ~512 tokens using a sliding window.
3. Chunks are embedded via Ollama and stored with metadata `{ source: "transcript", speaker, timestamp }`.
4. This happens in the background without blocking the UI or audio pipeline.
5. Enables queries like "what did the interviewer say about system design?" during the meeting.

### 3.5 Retrieval Pipeline (On Space Press)

#### 3.5.1 Query Construction

```
query = detected_question 
        ?? last_30_seconds_of_transcript 
        ?? "summarize the recent conversation"
```

If a question was detected, use it directly. Otherwise, use recent transcript as the query. Fallback to a generic query if transcript is empty.

#### 3.5.2 Hybrid Search

```rust
async fn hybrid_search(query: &str, config: &RagConfig) -> Vec<ScoredChunk> {
    // 1. Embed the query
    let query_embedding = ollama_client.embed(EmbedRequest {
        model: config.embedding_model.clone(),
        input: vec![format!("search_query: {}", query)], // nomic-embed-text query prefix
    }).await?.embeddings[0];
    
    // 2. Semantic search via sqlite-vec
    let semantic_results = db.query(
        "SELECT id, text, metadata, distance 
         FROM rag_embeddings 
         WHERE embedding MATCH ?1
         ORDER BY distance ASC
         LIMIT ?2",
        params![query_embedding.as_bytes(), config.top_k * 2], // Fetch 2x for RRF merge
    )?;
    
    // 3. Keyword search via FTS5
    let keyword_results = db.query(
        "SELECT id, text, metadata, rank 
         FROM rag_fts 
         WHERE rag_fts MATCH ?1
         ORDER BY rank
         LIMIT ?2",
        params![fts5_query(query), config.top_k * 2],
    )?;
    
    // 4. Reciprocal Rank Fusion
    let merged = rrf_merge(
        semantic_results, 
        keyword_results, 
        config.semantic_weight, // Default 0.7
        config.top_k,           // Default 5
    );
    
    // 5. Filter by similarity threshold
    merged.into_iter()
        .filter(|c| c.score >= config.similarity_threshold)
        .take(config.top_k)
        .collect()
}
```

#### 3.5.3 RRF Merge Algorithm

```
RRF_score(doc) = Σ [ weight_i / (k + rank_i(doc)) ]

where:
  k = 60 (standard RRF constant)
  weight_semantic = config.semantic_weight (default 0.7)
  weight_keyword = 1.0 - config.semantic_weight (default 0.3)
  rank_i(doc) = position of doc in result list i (1-indexed)
```

Documents appearing in both lists get higher combined scores. Documents appearing in only one list still contribute.

#### 3.5.4 Prompt Assembly

```
┌────────────────────────────────────────────────────────────┐
│ SYSTEM:                                                    │
│ You are NexQ, an AI meeting assistant. Answer the          │
│ detected question using the provided context. Be concise   │
│ and actionable. Use the user's background to personalize.  │
│                                                            │
│ {custom_instructions}                                      │
│                                                            │
│ RELEVANT CONTEXT (from user's documents):                  │
│ ---                                                        │
│ [Source: Resume_VahidAlizadeh.pdf, chunk 3]                │
│ {chunk_text_1}                                             │
│ ---                                                        │
│ [Source: SystemDesignNotes.md, chunk 12]                   │
│ {chunk_text_2}                                             │
│ ---                                                        │
│ [Source: JD_SeniorSWE_Google.txt, chunk 5]                 │
│ {chunk_text_3}                                             │
│ ---                                                        │
│ [Source: transcript, 14:32]                                │
│ {chunk_text_4}                                             │
│ ---                                                        │
│ [Source: Resume_VahidAlizadeh.pdf, chunk 7]                │
│ {chunk_text_5}                                             │
│                                                            │
│ RECENT CONVERSATION (last 2 minutes):                      │
│ [14:30] User: I've worked with distributed systems...      │
│ [14:31] Interviewer: Can you walk me through how you'd     │
│ design a URL shortener?                                    │
│                                                            │
│ DETECTED QUESTION:                                         │
│ How would you design a URL shortener?                      │
│                                                            │
│ USER:                                                      │
│ Generate a suggested response.                             │
└────────────────────────────────────────────────────────────┘
```

### 3.6 Database Schema (sqlite-vec Extension)

```sql
-- Load sqlite-vec extension on startup
-- In Rust: conn.load_extension("vec0")

-- Context resource files (already exists, add columns)
CREATE TABLE IF NOT EXISTS context_resources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    resource_type TEXT NOT NULL,       -- "resume", "job_description", "notes", "custom"
    extracted_text TEXT,
    file_size INTEGER,
    token_count INTEGER,
    chunk_count INTEGER DEFAULT 0,
    index_status TEXT DEFAULT 'pending', -- "pending", "indexing", "indexed", "error"
    last_indexed_at INTEGER,
    created_at INTEGER NOT NULL
);

-- RAG chunks with vector embeddings
CREATE VIRTUAL TABLE IF NOT EXISTS rag_vec USING vec0(
    id TEXT PRIMARY KEY,
    embedding FLOAT[768]               -- nomic-embed-text dimension
);

-- Chunk metadata (separate from vec0 which only stores vectors)
CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY,
    file_id TEXT,                       -- FK to context_resources.id or "transcript"
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    source_type TEXT NOT NULL,          -- "file" or "transcript"
    speaker TEXT,                       -- Only for transcript chunks
    timestamp_ms INTEGER,              -- Only for transcript chunks
    metadata TEXT,                     -- JSON: { start_char, end_char, ... }
    created_at INTEGER NOT NULL,
    FOREIGN KEY (file_id) REFERENCES context_resources(id) ON DELETE CASCADE
);

-- Full-text search index for keyword search
CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(
    id UNINDEXED,
    text,
    content=rag_chunks,
    content_rowid=rowid
);

-- Triggers to keep FTS5 in sync
CREATE TRIGGER rag_chunks_ai AFTER INSERT ON rag_chunks BEGIN
    INSERT INTO rag_fts(rowid, id, text) VALUES (new.rowid, new.id, new.text);
END;

CREATE TRIGGER rag_chunks_ad AFTER DELETE ON rag_chunks BEGIN
    INSERT INTO rag_fts(rag_fts, rowid, id, text) VALUES ('delete', old.rowid, old.id, old.text);
END;
```

### 3.7 Rust Module Structure

```
src-tauri/src/rag/
├── mod.rs                    // RagManager: top-level orchestrator
├── config.rs                 // RagConfig struct, defaults, validation
├── chunker.rs                // RecursiveCharacterTextSplitter implementation
├── embedder.rs               // Ollama embedding client (HTTP, batch, retry)
├── vector_store.rs           // sqlite-vec operations (insert, search, delete)
├── fts_store.rs              // FTS5 operations (insert, search, delete)
├── search.rs                 // HybridSearch: semantic + keyword + RRF merge
├── prompt_builder.rs         // Assembles final prompt from chunks + transcript + question
├── file_processor.rs         // PDF/TXT/MD/DOCX text extraction
├── transcript_indexer.rs     // Real-time transcript chunk indexing
└── test_search.rs            // Test Search dialog backend (for debugging)
```

### 3.8 Tauri Commands (IPC)

```rust
// === Context Resource Management ===
#[tauri::command]
async fn add_context_file(file_path: String) -> Result<ContextResource, String>;

#[tauri::command]
async fn remove_context_file(resource_id: String) -> Result<(), String>;

#[tauri::command]
async fn list_context_resources() -> Result<Vec<ContextResource>, String>;

// === RAG Index Management ===
#[tauri::command]
async fn rebuild_rag_index() -> Result<(), String>;
// Progress via events: listen("rag_index_progress")

#[tauri::command]
async fn rebuild_file_index(resource_id: String) -> Result<(), String>;

#[tauri::command]
async fn clear_rag_index() -> Result<(), String>;

#[tauri::command]
async fn get_rag_status() -> Result<RagIndexStatus, String>;

// === RAG Search ===
#[tauri::command]
async fn test_rag_search(query: String) -> Result<Vec<SearchResult>, String>;
// Returns chunks with scores for the Test Search dialog

// === RAG Config ===
#[tauri::command]
async fn get_rag_config() -> Result<RagConfig, String>;

#[tauri::command]
async fn update_rag_config(config: RagConfig) -> Result<(), String>;

// === Ollama Embedding Health ===
#[tauri::command]
async fn test_ollama_embedding_connection() -> Result<OllamaStatus, String>;

#[tauri::command]
async fn pull_embedding_model(model: String) -> Result<(), String>;
// Progress via events: listen("ollama_pull_progress")
```

### 3.9 IPC Events

```typescript
// Frontend listens for these events from Rust

// RAG indexing progress
interface RagIndexProgress {
    current_file: string;
    file_index: number;
    total_files: number;
    current_chunk: number;
    total_chunks: number;
    status: "indexing" | "complete" | "error";
    error_message?: string;
}
listen<RagIndexProgress>("rag_index_progress", (event) => { ... });

// Ollama model pull progress
interface OllamaPullProgress {
    status: string;       // "downloading", "verifying", "complete"
    completed: number;    // bytes downloaded
    total: number;        // total bytes
}
listen<OllamaPullProgress>("ollama_pull_progress", (event) => { ... });

// Live transcript indexed (real-time during meeting)
interface TranscriptIndexed {
    chunk_count: number;
    latest_timestamp_ms: number;
}
listen<TranscriptIndexed>("transcript_indexed", (event) => { ... });
```

### 3.10 Performance Targets

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Single file indexing (10 pages PDF) | < 5 seconds | Timer from add_context_file to index complete |
| Embedding latency (single chunk) | < 50ms | Ollama /api/embed response time |
| Embedding latency (32-chunk batch) | < 200ms | Ollama /api/embed batch response time |
| Query embedding | < 50ms | Embed single query string |
| sqlite-vec ANN search (1000 chunks) | < 10ms | SQL query execution time |
| FTS5 keyword search | < 5ms | SQL query execution time |
| RRF merge + filter | < 1ms | In-memory computation |
| Total retrieval (embed + search + merge) | < 70ms | End-to-end from query to ranked chunks |
| Prompt assembly | < 5ms | String concatenation |
| Memory overhead (index in RAM) | < 50MB for 10K chunks | Process memory delta |

---

## 4. Phase 2: Gemini Context Cache (Coming Soon)

> **Status**: Phase 2 — UI placeholder with "Coming Soon" badge in Phase 1 release.
> **Prerequisite**: User must have Google Gemini selected as LLM provider and a valid Gemini API key.

### 4.1 Architecture

```
User adds files in Context Panel
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│ CACHE CREATION PIPELINE (Rust, on demand)                │
│                                                          │
│  1. Extract text from all context files (same as RAG)    │
│                                                          │
│  2. Upload files to Gemini Files API                     │
│     POST /v1/files → get file_id per file                │
│                                                          │
│  3. Create cached content                                │
│     POST /v1beta/cachedContents                          │
│     Contents: all file_ids + system instructions         │
│     TTL: configurable (default: meeting duration + 30m)  │
│                                                          │
│  4. Store cache reference locally                        │
│     cache_name, expire_time, token_count, cost estimate  │
└──────────────────────────────────────────────────────────┘
          │
          │ (on Space press)
          ▼
┌──────────────────────────────────────────────────────────┐
│ GENERATION PIPELINE (Rust, on demand)                    │
│                                                          │
│  1. Build request with cache reference:                  │
│     {                                                    │
│       "cachedContent": "cachedContents/abc123",          │
│       "contents": [{                                     │
│         "text": "<transcript> + <question>"              │
│       }]                                                 │
│     }                                                    │
│                                                          │
│  2. Only transcript + question sent as new tokens        │
│     (~2K tokens vs full context)                         │
│                                                          │
│  3. Gemini reads cached context at 90% discount          │
│                                                          │
│  4. Stream response back via IPC                         │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Settings UI: Gemini Cache Configuration

When "Gemini Cache" is selected as active strategy (Phase 2):

```
┌─────────────────────────────────────────────────────────────┐
│  GEMINI CACHE SETTINGS                                      │
│                                                             │
│  ⚠️ Requires: Gemini selected as LLM provider with valid   │
│  API key. Context caching is only available with Gemini.    │
│                                                             │
│  ┌─── Cache Management ─────────────────────────────────┐   │
│  │                                                      │   │
│  │  Current Cache                                       │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  Status: ● Active                            │    │   │
│  │  │  Name: cachedContents/xK9m2...               │    │   │
│  │  │  Tokens: 31,240                              │    │   │
│  │  │  Files: 3 (Resume.pdf, JD.txt, Notes.md)     │    │   │
│  │  │  Created: 14:02 · Expires: 15:32             │    │   │
│  │  │  Storage cost so far: $0.0004                 │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │                                                      │   │
│  │  [ Delete Cache ]  [ Refresh TTL ]  [ Recreate ]     │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── Cache Creation ───────────────────────────────────┐   │
│  │                                                      │   │
│  │  When to Create Cache                                │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  On Meeting Start (automatic)             ▼ │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │  Options: On Meeting Start / On First Space Press /  │   │
│  │  Manual Only (click "Create Cache" in Context Panel) │   │
│  │                                                      │   │
│  │  Auto-Recreate on File Change                        │   │
│  │  [✓] Automatically delete and recreate cache when    │   │
│  │  files are added or removed from context.            │   │
│  │                                                      │   │
│  │  Cache TTL                                           │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  90 minutes                              ▼  │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │  Options: 30m / 60m / 90m / 120m / 180m / Custom     │   │
│  │  Longer = more storage cost. Auto-deleted on expiry. │   │
│  │                                                      │   │
│  │  Auto-Delete on Meeting End                          │   │
│  │  [✓] Delete cache when meeting ends to stop          │   │
│  │  storage billing immediately.                        │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ▶ Advanced Gemini Cache Settings                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │  Gemini Model for Caching                            │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  gemini-2.5-flash (same as LLM setting)  ▼ │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │  Cache is model-specific. Must match LLM provider    │   │
│  │  model setting.                                      │   │
│  │                                                      │   │
│  │  Include System Instructions in Cache                │   │
│  │  [✓] Cache NexQ's system prompt with the files.      │   │
│  │  Saves ~200 tokens per request.                      │   │
│  │                                                      │   │
│  │  Fallback on Cache Miss                              │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  Auto-recreate cache                     ▼  │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │  Options: Auto-recreate / Fall back to context       │   │
│  │  stuffing / Fall back to Local RAG / Show error      │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── Cost Estimator ──────────────────────────────────┐    │
│  │                                                     │    │
│  │  Current Session Costs (via API)                    │    │
│  │  ┌──────────────────────────────────────────────┐   │    │
│  │  │  Cache creation:     $0.0094                 │   │    │
│  │  │  Cache storage:      $0.0004 (12 min so far) │   │    │
│  │  │  Cached reads (7x):  $0.0007                 │   │    │
│  │  │  Fresh tokens (7x):  $0.0042                 │   │    │
│  │  │  Output tokens (7x): $0.0088                 │   │    │
│  │  │  ──────────────────────────────              │   │    │
│  │  │  Total this session: $0.0235                 │   │    │
│  │  │  vs. Stuffing would cost: $0.0680            │   │    │
│  │  │  Savings: 65% ($0.0445 saved)                │   │    │
│  │  └──────────────────────────────────────────────┘   │    │
│  │                                                     │    │
│  │  Estimated cost per meeting (15 calls, 60 min):     │    │
│  │  $0.038 with cache vs $0.145 without                │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Context Panel UI (Gemini Cache Mode)

When Gemini Cache is the active strategy, the Context Panel shows cache-specific controls:

```
┌─────────────────────────────────────────────────────────────┐
│  📋 MEETING CONTEXT                                         │
│                                                             │
│  Strategy: Gemini Cache (gemini-2.5-flash)         [⚙️]     │
│                                                             │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │         ☁️ Drag files here                          │   │
│  │         PDF, TXT, DOCX, or Markdown                 │   │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                                             │
│  FILES (3)                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  📄 Resume.pdf         2.1K tokens   ● In cache     │    │
│  │  📝 JD.txt             1.4K tokens   ● In cache     │    │
│  │  📎 Notes.md           8.2K tokens   ● In cache     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ☁️ Gemini Cache                                    │    │
│  │  ● Active · Expires in 48 min                       │    │
│  │  31,240 tokens cached · $0.0004 storage so far      │    │
│  │                                                     │    │
│  │  Each Space press sends only ~2K new tokens          │    │
│  │  (transcript + question). Cached tokens: 90% off.   │    │
│  │                                                     │    │
│  │  [ Recreate Cache ]  [ Delete Cache ]               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ⚠️ Adding or removing a file will recreate the cache      │
│  (~3-8 seconds). Cache content is immutable.                │
│                                                             │
│  Token Budget                    11,900 / 1,000.0k (1%)     │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  All context cached on Gemini's servers.                    │
│  Gemini 2.5 Flash supports up to 1M token context.          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Cache Lifecycle

| Event | Behavior |
|-------|----------|
| User adds a file | If auto-recreate enabled: delete old cache → upload new file → create new cache with all files. Show "Recreating cache..." toast (~3-8s). |
| User removes a file | Same as above: delete old cache → create new cache without that file. |
| Meeting starts | If "On Meeting Start" selected: create cache if not already active. If cache exists and hasn't expired, reuse it. |
| Space pressed | Send request with `cachedContent: cache.name` + fresh transcript/question tokens only. |
| Meeting ends | If "Auto-Delete on Meeting End" enabled: call `caches.delete()`. Stop storage billing. |
| Cache expires (TTL) | On next Space press, detect 404 error → auto-recreate (if fallback = auto-recreate) or fall back to RAG/stuffing. |
| User switches LLM provider away from Gemini | Show warning: "Gemini Cache strategy requires Gemini as LLM provider. Switch to Local RAG or change provider back." |

### 4.5 Gemini API Integration

```rust
// Cache CRUD operations

// Create
POST https://generativelanguage.googleapis.com/v1beta/cachedContents
{
    "model": "models/gemini-2.5-flash",
    "displayName": "nexq-meeting-context",
    "contents": [
        { "role": "user", "parts": [
            { "text": "<extracted text from all files>" }
        ]}
    ],
    "systemInstruction": {
        "parts": [{ "text": "You are NexQ, an AI meeting assistant..." }]
    },
    "ttl": "5400s"  // 90 minutes
}
// Response: { "name": "cachedContents/abc123", "usageMetadata": { "totalTokenCount": 31240 } }

// Use in generation
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
{
    "cachedContent": "cachedContents/abc123",
    "contents": [{
        "role": "user",
        "parts": [{ "text": "TRANSCRIPT:\n...\n\nQUESTION: How would you design...?\n\nGenerate a response." }]
    }]
}

// Delete
DELETE https://generativelanguage.googleapis.com/v1beta/cachedContents/abc123

// Update TTL
PATCH https://generativelanguage.googleapis.com/v1beta/cachedContents/abc123
{ "ttl": "7200s" }

// List (for cost tracking)
GET https://generativelanguage.googleapis.com/v1beta/cachedContents
```

### 4.6 Cost Tracking

The app tracks Gemini cache costs locally by recording:

```rust
struct CacheSession {
    cache_name: String,
    created_at: i64,
    token_count: u32,
    ttl_seconds: u32,
    creation_cost: f64,       // token_count / 1M * input_price
    queries_made: u32,
    cached_read_tokens: u64,  // Accumulated from usage_metadata
    fresh_input_tokens: u64,
    output_tokens: u64,
}

// Cost formulas (Gemini 2.5 Flash):
// creation_cost = token_count / 1,000,000 * 0.30
// storage_cost  = token_count / 1,000,000 * 1.00 * (elapsed_hours)
// read_cost     = cached_read_tokens / 1,000,000 * 0.03 (90% off)
// fresh_cost    = fresh_input_tokens / 1,000,000 * 0.30
// output_cost   = output_tokens / 1,000,000 * 2.50
// total         = creation + storage + reads + fresh + output
// vs_stuffing   = (token_count + fresh_per_call) / 1M * 0.30 * queries
```

### 4.7 Limitations and Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|------------|
| Cache content is immutable | Cannot add/remove single file | Delete + recreate entire cache (~3-8s) |
| Cache is model-specific | Must use same Gemini model for cache and generation | Auto-sync model from LLM settings |
| Max cache size = model context window | 1M tokens for Gemini 2.5/3 (~4MB text) | Show warning when approaching limit. For larger contexts, suggest Local RAG. |
| TTL expires silently | 404 on next use | Implement self-healing: catch 404, auto-recreate, retry |
| Gemini-only | Cannot use with other LLM providers | Show error if user selects cache strategy without Gemini provider |
| Min cache size varies by model | Small contexts may not be cacheable | Fall back to implicit caching or context stuffing for small contexts |
| Storage cost accumulates | $1/MTok/hour can add up for large contexts left running | Auto-delete on meeting end (default). Show running cost in UI. |

---

## 5. Implementation Plan

### Phase 1: Local RAG (Weeks 1-3)

- [ ] **Week 1**: Core RAG infrastructure
  - [ ] sqlite-vec extension loading in rusqlite
  - [ ] Database schema (rag_vec, rag_chunks, rag_fts tables + triggers)
  - [ ] RagConfig struct with defaults and persistence
  - [ ] File processor: PDF/TXT/MD/DOCX text extraction
  - [ ] RecursiveCharacterTextSplitter implementation
  - [ ] Ollama embedding client with batching

- [ ] **Week 2**: Search and retrieval
  - [ ] sqlite-vec ANN search implementation
  - [ ] FTS5 keyword search implementation
  - [ ] RRF hybrid merge algorithm
  - [ ] Prompt builder (chunks + transcript + question assembly)
  - [ ] Integration with IntelligenceEngine (replace context stuffing path)
  - [ ] Live transcript indexer (background embedding during meeting)

- [ ] **Week 3**: Settings UI and Context Panel
  - [ ] Context Strategy tab in Settings (selector + Local RAG config)
  - [ ] Essential settings (model, status, top-K, search mode)
  - [ ] Advanced settings (chunking, search tuning, Ollama URL)
  - [ ] Updated Context Panel with per-file status, re-index, remove
  - [ ] RAG index status bar with chunk count and estimated prompt size
  - [ ] Test Search dialog (query → see retrieved chunks)
  - [ ] Gemini Cache card with "Coming Soon" badge (placeholder)
  - [ ] All Tauri commands and IPC events

### Phase 2: Gemini Context Cache (Weeks 4-5)

- [ ] **Week 4**: Cache infrastructure
  - [ ] Gemini Files API client (upload, list, delete)
  - [ ] Gemini CachedContents API client (create, delete, update TTL, list)
  - [ ] CacheSession tracking and cost calculation
  - [ ] Cache lifecycle management (create, expire handling, self-healing 404)
  - [ ] Integration with LLMRouter (detect Gemini, attach cached_content to requests)

- [ ] **Week 5**: Settings UI and Context Panel
  - [ ] Enable Gemini Cache card in strategy selector
  - [ ] Cache Management section (status, delete, refresh, recreate)
  - [ ] Cache Creation settings (when to create, auto-recreate, TTL, auto-delete)
  - [ ] Advanced settings (model sync, system instruction caching, fallback)
  - [ ] Cost Estimator panel (live costs from session tracking)
  - [ ] Updated Context Panel for cache mode (cache status, per-file cache indicator)
  - [ ] Warning/validation: Gemini provider required, model sync

---

## 6. Configuration Defaults Summary

### Local RAG Defaults

```json
{
  "context_strategy": "local_rag",
  "rag": {
    "embedding_model": "nomic-embed-text",
    "ollama_url": "http://localhost:11434",
    "batch_size": 32,
    "chunk_size": 512,
    "chunk_overlap": 64,
    "splitting_strategy": "recursive",
    "top_k": 5,
    "search_mode": "hybrid",
    "similarity_threshold": 0.3,
    "semantic_weight": 0.7,
    "include_transcript_in_rag": true,
    "transcript_context_window_seconds": 120
  }
}
```

### Gemini Cache Defaults

```json
{
  "context_strategy": "gemini_cache",
  "gemini_cache": {
    "create_on": "meeting_start",
    "auto_recreate_on_file_change": true,
    "ttl_minutes": 90,
    "auto_delete_on_meeting_end": true,
    "include_system_instructions": true,
    "fallback_on_cache_miss": "auto_recreate",
    "gemini_model": "auto"
  }
}
```

---

## 7. Error Handling

### Local RAG Errors

| Error | Detection | User-Facing Behavior |
|-------|-----------|---------------------|
| Ollama not running | Connection refused on embed request | Toast: "Ollama not running. Start Ollama or switch to Gemini Cache." + link to Ollama download. Status dot goes red. |
| Embedding model not pulled | 404 from Ollama | Toast: "Model nomic-embed-text not found." + "Pull Model" button in toast. |
| sqlite-vec extension load failure | Load error on startup | Toast: "RAG search unavailable. Falling back to context stuffing for this session." Log error for debugging. |
| File extraction failure (corrupt PDF) | pdf-extract returns error | Per-file error badge: "⚠️ Could not extract text". Other files continue indexing normally. |
| Embedding timeout | Ollama response > 30s | Retry once. If still fails, skip chunk and log warning. Continue with remaining chunks. |
| Zero results from search | Empty result set after RRF | Fall back to last 2 minutes of transcript as context (no RAG chunks). Show subtle indicator: "No relevant context found — using recent transcript." |

### Gemini Cache Errors

| Error | Detection | User-Facing Behavior |
|-------|-----------|---------------------|
| Cache expired (404) | `CachedContent not found` error | If fallback = auto-recreate: silently recreate and retry (~5s). Toast: "Cache expired, recreating..." |
| Gemini not selected as provider | Strategy = gemini_cache but LLM ≠ Gemini | Warning banner: "Gemini Cache requires Gemini as your LLM provider." + Switch button. |
| File too large (>1M tokens total) | Token count check before create | Warning: "Total context exceeds 1M tokens. Consider switching to Local RAG for large document sets." |
| API key invalid/expired | 401/403 from Gemini API | Toast: "Gemini API key invalid. Check Settings > LLM." |
| Rate limit | 429 from Gemini API | Exponential backoff retry (max 3 attempts). Toast if all fail. |
| Context below minimum cache size | Token count < model minimum | Fall back to implicit caching (send normally, Gemini may cache automatically). Toast: "Context too small for explicit caching. Using implicit caching." |

---

*End of Document — NexQ Context Intelligence PRD v1.0.0 — March 19, 2026*
