import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="flex-1 flex flex-col justify-between px-6 py-12">
        <div className="pt-8">
          <div className="mb-2">
            <span className="text-xs font-mono font-medium tracking-widest text-muted uppercase">
              Field Operations
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tighter text-zinc-900 leading-none mb-2">
            FSR Blinds
          </h1>
          <p className="text-sm text-muted leading-relaxed max-w-[32ch]">
            Measurement, bracketing, and installation management for commercial projects.
          </p>
        </div>

        <LoginForm />

        <p className="text-xs text-center text-zinc-400 leading-relaxed">
          Need access? Contact your project administrator
          <br />
          or email{" "}
          <a href="mailto:admin@fsrblinds.ca" className="text-accent font-medium">
            admin@fsrblinds.ca
          </a>
        </p>
      </div>
    </div>
  );
}
