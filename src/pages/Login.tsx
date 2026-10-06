import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AuthPanel, type AuthMode } from "@/components/AuthPanel";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { safeNext } from "@/lib/navigation";
import { HOME_BY_ROLE, isStaff, type Role } from "@contracts/roles";

/** Sign in (/login) and create account (/signup). */
export default function Login({ mode = "signin" }: { mode?: AuthMode }) {
  const { t, p } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  const { user, isLoading, error: accountError } = useAuth();
  const role = user?.role as Role | undefined;

  // Specialists → dashboard, technicians → jobs; customers return to where they were.
  useEffect(() => {
    if (isLoading || !role) return;
    navigate(isStaff(role) ? HOME_BY_ROLE[role] : next, { replace: true });
  }, [role, isLoading, navigate, next]);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="dotgrid flex flex-1 items-center justify-center px-4 py-24">
        <div className="card-br w-full max-w-md !rounded-[28px] p-6 sm:p-8" style={{ boxShadow: "0 6px 0 rgb(12 43 92 / 0.12)" }}>
          <img
            src="/assets/mascot-320.webp"
            width={320}
            height={408}
            alt=""
            className="mx-auto mb-5 h-auto w-20 drop-shadow-[0_10px_14px_rgba(8,30,66,0.2)]"
          />
          <AuthPanel key={mode} next={next} initialMode={mode} headingLevel="h1" />
          {accountError && (
            <p role="alert" className="mt-4 text-center text-sm font-semibold text-red-700">
              {accountError.message}
            </p>
          )}
          <div className="mt-6 text-center">
            <Link
              to="/"
              className="text-sm font-bold text-navy/70 underline underline-offset-4 hover:text-navy"
            >
              {p(t.join.backHome)}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
