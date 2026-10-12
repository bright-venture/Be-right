import { Component, type ReactNode } from "react";
import { isStaleBuildError, reloadForNewBuild, reportError } from "@/lib/reportError";

/**
 * Catches a crash while drawing a page: shows a way out instead of a blank screen,
 * and reports it. Both languages are shown, since the crash may be in the language code.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    if (isStaleBuildError(error) && reloadForNewBuild()) return;
    reportError(error, "render");
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="card-br w-full max-w-md p-8 text-center">
          <h1 className="font-display text-2xl font-black text-navy">Something went wrong on this page</h1>
          <p className="mt-2 text-navy/70">We've been told about it. Reloading usually fixes it.</p>
          <h2 dir="rtl" className="mt-6 font-display text-xl font-black text-navy">حدث خطأ في هذه الصفحة</h2>
          <p dir="rtl" className="mt-2 text-navy/70">تم إبلاغنا بذلك. عادةً ما تحلّ إعادة التحميل المشكلة.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button onClick={() => window.location.reload()} className="btn-pill-primary">
              Reload · إعادة التحميل
            </button>
            <a href="/" className="btn-pill-outline">
              Home · الرئيسية
            </a>
          </div>
        </div>
      </div>
    );
  }
}
