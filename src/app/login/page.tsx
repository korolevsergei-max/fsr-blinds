import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="flex-1 flex flex-col justify-between px-6 py-14 max-w-md mx-auto w-full">

        {/* Brand mark */}
        <div className="pt-6">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-tertiary uppercase mb-4">
            Field Operations
          </p>
          <h1 className="text-[2.5rem] font-bold tracking-[-0.03em] text-foreground leading-[1.05] mb-3">
            FSR Blinds
          </h1>
          <p className="text-[14px] text-secondary leading-relaxed max-w-[32ch]">
            Measurement, bracketing, and installation management for commercial projects.
          </p>
        </div>

        {/* Form surface */}
        <div className="surface-card p-6 my-10">
          <LoginForm />
        </div>

        {/* Footer note */}
        <p className="text-[12px] text-center text-tertiary leading-relaxed">
          Need access? Contact your project administrator{" "}
          <br className="hidden sm:inline" />
          or email{" "}
          <a
            href="mailto:admin@fsrblinds.ca"
            className="text-accent font-medium hover:underline"
          >
            admin@fsrblinds.ca
          </a>
        </p>

      </div>
    </div>
  );
}
