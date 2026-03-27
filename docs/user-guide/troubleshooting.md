# Troubleshooting

Common issues and solutions for NexQ. For detailed setup instructions, see the [Audio Setup Guide](audio-setup.md) and [AI Providers Guide](ai-providers.md).

## Installation Issues

### Windows SmartScreen Warning

**Problem**: Windows shows "Windows protected your PC" when running the installer.

**Solution**: This happens because the app is not yet code-signed. It is safe to proceed:

1. Click **"More info"** (the small text link below the warning message)
2. Click **"Run anyway"**

This only appears the first time you install. Subsequent launches will not trigger SmartScreen.

### Installer Fails to Run

**Problem**: The installer does not start or crashes immediately.

**Solution**:
- Ensure you downloaded the correct architecture (x64)
- Try right-clicking the installer and selecting "Run as administrator"
- Check that your Windows version is 10 or later
- Temporarily disable antivirus software if it is blocking the installer

## Audio Issues

### No Audio Detected

**Problem**: Audio level meters show no activity, or transcript shows nothing.

**Solution**:

1. **Check device selection**: Open Settings > Audio and verify the correct devices are selected for "You" (mic) and "Them" (system audio)
2. **Test devices**: Click the **Test** button next to each device to verify audio levels
3. **Check Windows permissions**: Go to Windows Settings > Privacy > Microphone and ensure NexQ has microphone access
4. **Check mute state**: Ensure neither "You" nor "Them" sources are muted in the overlay controls
5. **Restart audio**: End the current meeting and start a new one to reinitialize audio capture

### System Audio Not Capturing

**Problem**: "Them" transcript is empty even though you can hear remote participants.

**Solution**:

1. Verify the correct **output device** is selected for "Them" -- this should be the device your meeting app plays audio through
2. Check that audio is actually playing through that device (Windows sound mixer should show activity)
3. Open **Windows Settings > System > Sound** and confirm the correct default output device is set
4. Some devices may not support WASAPI loopback capture. Try selecting a different output device
5. If using a virtual audio cable or routing software, ensure it is configured correctly
6. See the [Audio Setup Guide](audio-setup.md) for detailed WASAPI loopback troubleshooting

### Microphone Echo or Feedback

**Problem**: Your own voice appears in the "Them" transcript, or there is echo.

**Solution**:

- Use headphones to prevent your speakers from feeding back into the microphone
- Ensure "You" and "Them" are using different physical devices
- Check that your meeting app has echo cancellation enabled

## Speech-to-Text Issues

### STT Not Working

**Problem**: Audio levels show activity but no transcript appears.

**Solution**:

1. **Check provider config**: Open Settings > STT and verify your provider is correctly configured
2. **Test connection**: Click **Test Connection** to verify the STT provider is reachable
3. **Check API key**: For cloud providers (Deepgram, Groq), ensure your API key is valid and has not expired
4. **Check internet connection**: Cloud STT providers require a stable internet connection. If your connection is intermittent, transcription may fail silently
5. **Try Web Speech API**: Switch to Web Speech API temporarily to verify audio is reaching the STT pipeline. If Web Speech works but your chosen provider does not, the issue is with the provider configuration
6. **Check STT debug log**: Look at the STT connection status indicators in the overlay for error messages
7. See the [AI Providers Guide](ai-providers.md) for provider-specific setup instructions

### Web Speech API Stops Working

**Problem**: Web Speech API transcription stops mid-meeting or becomes unresponsive.

**Solution**:

- Web Speech API has session limits in some browser engines. Ending and restarting the meeting resets the session
- Do not switch STT providers mid-session without stopping first -- hot-swapping the Web Speech API breaks the browser recognition session
- Ensure you have an active internet connection (Web Speech API may require it depending on the system)

### Local Whisper Model Slow or Inaccurate

**Problem**: Local Whisper transcription has high latency or poor accuracy.

**Solution**:

- **Use a larger model** for better accuracy (large-v3 > medium > small > base > tiny)
- **Use a smaller model** for lower latency if accuracy is acceptable
- Switch to a cloud provider (Deepgram, Groq) for the best balance of speed and accuracy
- Close other CPU-intensive applications to free resources for the model

## LLM Issues

### AI Assist Not Responding

**Problem**: Pressing Space or clicking AI actions produces no response.

**Solution**:

1. **Check provider config**: Open Settings > LLM and verify your provider is connected
2. **Test connection**: Click **Test Connection** to verify the LLM provider is reachable
3. **Check API key**: For cloud providers, ensure your API key is valid
4. **Ollama**: Verify Ollama is running (`ollama list` in terminal) and has at least one model pulled
5. **Check model selection**: Ensure a model is selected in the LLM settings dropdown

### Ollama Not Detected

**Problem**: NexQ shows "Ollama not reachable" or no models appear.

**Solution**:

1. Verify Ollama is installed and running: open a terminal and run `ollama list`
2. If no models appear, pull one: `ollama pull llama3.2`
3. Ensure Ollama is serving on the default port: `http://localhost:11434`
4. Restart NexQ after starting Ollama -- auto-detection runs on startup

### AI Responses Slow

**Problem**: AI suggestions take a long time to appear, or responses stream very slowly.

**Solution**:

1. **Switch to a faster LLM provider.** Groq provides the fastest cloud inference with a free tier. See the [AI Providers Guide](ai-providers.md) for speed comparisons.
2. **Use a smaller local model.** If using Ollama, switch from a large model to a smaller one (e.g., llama3.2 3B instead of 8B).
3. **Check your internet connection.** Cloud providers require a stable connection. Slow or intermittent connections cause delayed responses.
4. **Reduce the context window.** In Settings, reduce the amount of transcript data sent to the LLM. Less input means faster responses.
5. **Close other resource-intensive applications.** Local LLMs compete with other apps for CPU/RAM.

## Overlay Issues

### Overlay Not Showing

**Problem**: The overlay window does not appear when starting a meeting.

**Solution**:

1. **Verify a meeting is active.** The overlay only appears during an active meeting. Press `Ctrl+M` to start a meeting first.
2. Press `Ctrl+B` to toggle the overlay window
3. The overlay may be positioned off-screen. Try moving it by checking the taskbar for the "NexQ Overlay" entry
4. Check Windows taskbar for a second NexQ window entry -- the overlay might be minimized
5. Restart NexQ -- the overlay resets to position (50, 50) on startup

### Overlay Not Staying on Top

**Problem**: The overlay disappears behind other windows.

**Solution**:

- The overlay is configured as always-on-top by default. If it is not staying on top, some full-screen applications may override this behavior
- Try running your meeting application in windowed mode instead of full-screen
- Check that no other always-on-top application is competing for the topmost position

## Performance Issues

### High CPU Usage

**Problem**: NexQ is using excessive CPU, causing system slowdown.

**Solution**:

- **Local Whisper STT** is the most common cause. Switch to a cloud STT provider (Web Speech API, Deepgram, or Groq) to reduce CPU usage significantly
- **Local LLM** (Ollama with large models) can also be CPU-intensive during generation. Consider using a cloud LLM provider for lower resource usage
- Close the AI Call Log sidebar if you do not need real-time call debugging
- Reduce the context window duration in Settings to send less transcript data to the LLM

### High Memory Usage

**Problem**: NexQ memory usage grows over time during long meetings.

**Solution**:

- Long meetings accumulate transcript segments in memory. This is expected behavior
- End and restart meetings periodically for very long sessions (4+ hours)
- Close context documents you no longer need from the Context Intelligence panel
- If using local RAG, the embedding index consumes memory proportional to document size

## Data and Storage

### Where Is My Data Stored?

NexQ stores all data in the app data directory:

```
%LOCALAPPDATA%\com.nexq.app\
```

This includes:
- SQLite database (meetings, transcripts, AI interactions)
- Downloaded STT models (`models/` subdirectory)
- Audio recordings (if recording is enabled)
- RAG index and embeddings

### API Keys

API keys are stored in **Windows Credential Manager**, not in files. You can view or remove them through Windows Settings > Credential Manager, or through NexQ's Settings panel.

## Still Need Help?

If your issue is not covered here, these guides may help:

- [Audio Setup Guide](audio-setup.md) -- Detailed audio device configuration and troubleshooting
- [AI Providers Guide](ai-providers.md) -- Provider setup, comparison, and configuration
- [Using Context Intelligence (RAG)](rag-context.md) -- Document loading and indexing issues
- [Getting Started](getting-started.md) -- Initial setup walkthrough
