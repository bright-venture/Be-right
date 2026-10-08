/**
 * Development only: `?app` on a computer shows the app inside a phone-sized frame, so every
 * page uses its real phone layout (pages size themselves to the window, and a computer window
 * is far wider than a phone). Inside the frame the app runs as usual; the phone app and the
 * website never show this.
 */
export function AppPreviewFrame() {
  const height = Math.min(844, window.innerHeight - 96);
  const BEZEL = 10; // the frame's border, outside the phone's 390-pixel screen
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#1f2937] p-6 font-sans">
      <iframe
        title="Be Right app preview"
        src={window.location.href}
        width={390 + 2 * BEZEL}
        height={height + 2 * BEZEL}
        className="rounded-[36px] border-[10px] border-black bg-white shadow-2xl"
      />
      <p className="text-center text-xs text-white/70">
        App preview, phone size (390 × {height}).{" "}
        <a href={`${window.location.pathname}?app=0`} className="font-bold text-white underline underline-offset-2">
          Back to the website
        </a>
      </p>
    </div>
  );
}
