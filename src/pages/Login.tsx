import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "../contexts/AuthContext";
import { getRoleLandingPage } from "../lib/types";
import { AvatarGrid } from "../components/auth/AvatarGrid";
import { PinPad } from "../components/auth/PinPad";
import { ChefHat, ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { getLastUserId, clearLastUserId } from "../lib/lastUser";

export default function Login() {
  useDocumentTitle('Login');
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();

  // The user's explicit choice, NOT the effective selection:
  //   undefined -> hasn't chosen; fall back to whoever signed in last
  //   null      -> tapped "Login as someone else"; show the grid
  //   Id        -> tapped this person in the grid
  // The selection itself is DERIVED below. Keeping the choice (rather than the
  // result) is what lets the remembered user be applied on the first frame that
  // has data -- syncing it in via an effect would paint the grid first and then
  // snap to the PIN pad, and would need a guard against live-query re-emissions.
  const [explicitChoice, setExplicitChoice] = useState<Id<"users"> | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [remainingAttempts, setRemainingAttempts] = useState<number | undefined>();
  const [lockedUntil, setLockedUntil] = useState<number | undefined>();

  const activeUsers = useQuery(api.auth.queries.getActiveUsers);

  // Read storage once per mount. The stored id is device-controlled, so it is
  // only ever used to look someone up in the server's active-user list.
  const rememberedId = useRef(getLastUserId()).current;
  const rememberedUser = activeUsers?.find(u => u._id === rememberedId) ?? null;

  const selectedUserId = explicitChoice !== undefined ? explicitChoice : (rememberedUser?._id ?? null);
  const autoSelected = explicitChoice === undefined && rememberedUser !== null;
  const selectedUser = activeUsers?.find(u => u._id === selectedUserId);

  // One rule for what the escape hatch means, rendered twice (arrow + button).
  const cancelLabel = autoSelected ? "Login as someone else" : "Cancel";

  // Remembered user is no longer active (deactivated or deleted) -- forget them.
  // Idempotent, so it needs no one-shot guard; the derived state above has
  // already fallen back to the grid.
  useEffect(() => {
    if (activeUsers && rememberedId && !rememberedUser) clearLastUserId();
  }, [activeUsers, rememberedId, rememberedUser]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const landingPage = getRoleLandingPage(user.role);
      navigate(landingPage, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const clearPinErrors = () => {
    setError(undefined);
    setRemainingAttempts(undefined);
    setLockedUntil(undefined);
  };

  const handleSelectUser = (userId: Id<"users">) => {
    setExplicitChoice(userId);
    clearPinErrors();
  };

  const handleCancelPinEntry = () => {
    setExplicitChoice(null);
    clearPinErrors();
  };

  const handlePinSubmit = async (pin: string) => {
    if (!selectedUserId) return;

    setIsLoading(true);
    setError(undefined);

    try {
      const result = await login(selectedUserId, pin);

      if (result.success) {
        // Navigation happens via the useEffect above
      } else {
        setError(result.error);
        setRemainingAttempts(result.remainingAttempts);
        setLockedUntil(result.lockedUntil);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col">
      {/* Header */}
      <header className="p-6">
        <div className="flex items-center justify-center space-x-3">
          <ChefHat className="w-10 h-10 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Frollie Pro</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-start justify-center pt-8 p-6">
        <div className="w-full max-w-lg">
          {!selectedUserId ? (
            // Step 1: Select User
            <div className="bg-card rounded-2xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-center mb-6">
                Who's signing in?
              </h2>
              <AvatarGrid
                selectedUserId={selectedUserId}
                onSelectUser={handleSelectUser}
              />
            </div>
          ) : (
            // Step 2: Enter PIN
            <div className="bg-card rounded-2xl shadow-lg p-6">
              {/* Back button and user info */}
              <div className="flex items-center mb-6">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelPinEntry}
                  className="mr-3"
                  aria-label={cancelLabel}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>

                <div className="flex items-center flex-1">
                  {selectedUser?.avatarUrl ? (
                    <img
                      src={selectedUser.avatarUrl}
                      alt={selectedUser.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-lg font-medium">
                        {selectedUser?.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="ml-3">
                    <div className="font-medium">{selectedUser?.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {autoSelected ? "Welcome back — enter your PIN" : "Enter your PIN"}
                    </div>
                  </div>
                </div>
              </div>

              {/* PIN Pad */}
              <PinPad
                onSubmit={handlePinSubmit}
                onCancel={handleCancelPinEntry}
                cancelLabel={cancelLabel}
                isLoading={isLoading}
                error={error}
                remainingAttempts={remainingAttempts}
                lockedUntil={lockedUntil}
              />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-muted-foreground">
        Frollie Pro &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
