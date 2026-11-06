// OpenRouter'ın akışını (SSE) satır satır okur ve parçaları geri çağırır.
export class StreamError extends Error {}

export async function readSSE(
  body: ReadableStream<Uint8Array>,
  onDelta: (d: { content?: string; reasoning?: string }) => void
) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue; // ": OPENROUTER PROCESSING" gibi yorumları atla
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let j: any;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.error) throw new StreamError(j.error.message || "Akış sırasında hata oluştu.");
      const d = j.choices?.[0]?.delta;
      if (d) onDelta({ content: d.content || undefined, reasoning: d.reasoning || undefined });
    }
  }
}
