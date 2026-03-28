import type { DemoScenario } from './types';
import type { ContextResource, TokenBudget, RagConfig, RagIndexStatus } from '../../lib/types';
import { useMeetingStore } from '../../stores/meetingStore';
import { useContextStore } from '../../stores/contextStore';
import { useRagStore } from '../../stores/ragStore';

// ---------------------------------------------------------------------------
// Context resources
// ---------------------------------------------------------------------------

function makeResources(): ContextResource[] {
  const now = new Date().toISOString();

  return [
    {
      id: 'demo-ctx-001',
      name: 'resume-2026.pdf',
      file_type: 'pdf',
      file_path: 'C:\\Users\\demo\\Documents\\resume-2026.pdf',
      size_bytes: 245760,
      token_count: 1847,
      preview: 'Experienced software engineer with 5+ years in distributed systems, cloud architecture, and real-time data pipelines...',
      loaded_at: now,
      chunk_count: 12,
      index_status: 'indexed',
      last_indexed_at: now,
    },
    {
      id: 'demo-ctx-002',
      name: 'google-job-desc.docx',
      file_type: 'docx',
      file_path: 'C:\\Users\\demo\\Documents\\google-job-desc.docx',
      size_bytes: 189440,
      token_count: 2103,
      preview: 'Senior Software Engineer, Google Cloud Platform — Design and implement scalable distributed systems...',
      loaded_at: now,
      chunk_count: 15,
      index_status: 'indexed',
      last_indexed_at: now,
    },
    {
      id: 'demo-ctx-003',
      name: 'system-design-notes.md',
      file_type: 'md',
      file_path: 'C:\\Users\\demo\\Documents\\system-design-notes.md',
      size_bytes: 12800,
      token_count: 890,
      preview: '# System Design Patterns\n\n## Load Balancing\n- Round robin for stateless services\n- Consistent hashing for stateful...',
      loaded_at: now,
      chunk_count: 6,
      index_status: 'indexed',
      last_indexed_at: now,
    },
    {
      id: 'demo-ctx-004',
      name: 'ds-cheatsheet.txt',
      file_type: 'txt',
      file_path: 'C:\\Users\\demo\\Documents\\ds-cheatsheet.txt',
      size_bytes: 5120,
      token_count: 456,
      preview: 'Data Structures Quick Reference:\n- HashMap: O(1) avg lookup, O(n) worst case\n- B-Tree: O(log n) search, insert, delete...',
      loaded_at: now,
      chunk_count: 3,
      index_status: 'indexed',
      last_indexed_at: now,
    },
  ];
}

// ---------------------------------------------------------------------------
// Token budget
// ---------------------------------------------------------------------------

function makeTokenBudget(): TokenBudget {
  return {
    total: 5296,
    limit: 16000,
    segments: [
      { label: 'Resume', tokens: 1847, color: '#3b82f6', category: 'resume' },
      { label: 'Job Description', tokens: 2103, color: '#8b5cf6', category: 'jd' },
      { label: 'Notes', tokens: 1346, color: '#10b981', category: 'notes' },
      { label: 'System Prompt', tokens: 450, color: '#6b7280', category: 'system' },
      { label: 'Headroom', tokens: 10254, color: '#27272a', category: 'headroom' },
    ],
  };
}

// ---------------------------------------------------------------------------
// RAG config + status
// ---------------------------------------------------------------------------

function makeRagConfig(): RagConfig {
  return {
    enabled: true,
    embedding_model: 'nomic-embed-text',
    ollama_url: 'http://localhost:11434',
    batch_size: 32,
    chunk_size: 512,
    chunk_overlap: 64,
    splitting_strategy: 'recursive',
    top_k: 5,
    search_mode: 'hybrid',
    similarity_threshold: 0.3,
    semantic_weight: 0.7,
    include_transcript: false,
    embedding_dimensions: 768,
  };
}

function makeIndexStatus(): RagIndexStatus {
  return {
    total_files: 4,
    indexed_files: 4,
    total_chunks: 36,
    total_tokens: 5296,
    last_indexed_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// populate()
// ---------------------------------------------------------------------------

function populate(): void {
  // 1. Set launcher view with no active meeting
  useMeetingStore.setState({
    currentView: 'launcher',
    activeMeeting: null,
  });

  // 2. Context resources — 4 indexed documents
  useContextStore.setState({
    resources: makeResources(),
    tokenBudget: makeTokenBudget(),
    isLoading: false,
    error: null,
  });

  // 3. RAG store — fully indexed state
  useRagStore.setState({
    ragConfig: makeRagConfig(),
    indexStatus: makeIndexStatus(),
    isIndexing: false,
    indexProgress: null,
    indexStale: false,
    sourcesChangedSinceBuild: false,
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ragContextScenario: DemoScenario = {
  id: 'rag-context',
  name: 'RAG & Context Intelligence',
  description: '4 indexed documents with active RAG pipeline and token budget visualization',
  icon: '📚',
  supportsPlay: false,
  window: 'launcher',
  populate,
};
