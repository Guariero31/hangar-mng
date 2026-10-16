const AUDIO_RECOVERY = `<script>
(() => {
  const originalPlay = HTMLMediaElement.prototype.play;
  const waiting = new Map();
  let button;
  function updateButton() {
    if (!waiting.size) { button?.remove(); button = null; return; }
    if (button || !document.body) return;
    button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Ativar música';
    button.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;padding:12px 18px;border:1px solid #ffca54;border-radius:8px;background:#ffca54;color:#17140b;font:600 14px sans-serif;cursor:pointer';
    button.onclick = () => {
      for (const media of waiting.keys()) media.play().catch(() => {
        if (button) button.textContent = 'Não foi possível tocar. Tentar novamente';
      });
    };
    document.body.append(button);
  }
  function complete(media) {
    const pending = waiting.get(media) || [];
    waiting.delete(media);
    for (const resolve of pending) resolve();
    updateButton();
  }
  HTMLMediaElement.prototype.play = function () {
    const media = this;
    return originalPlay.call(media).then(() => complete(media)).catch((error) => {
      if (error.name !== 'NotAllowedError') throw error;
      return new Promise((resolve) => {
        if (!waiting.has(media)) waiting.set(media, []);
        waiting.get(media).push(resolve);
        updateButton();
      });
    });
  };
  document.addEventListener('DOMContentLoaded', updateButton, { once: true });
})();
</script>`;

/** Recover blocked autoplay through a trusted click inside the sandboxed document. */
export function withBriefingAudioRecovery(content: Buffer): Buffer {
  const html = content.toString('utf8');
  const head = /<head(?:\s[^>]*)?>/i;
  if (head.test(html)) return Buffer.from(html.replace(head, (tag) => tag + AUDIO_RECOVERY));
  const doctype = /^\s*<!doctype[^>]*>/i;
  return Buffer.from(doctype.test(html) ? html.replace(doctype, (tag) => tag + AUDIO_RECOVERY) : AUDIO_RECOVERY + html);
}
