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

  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [remainingAttempts, setRemainingAttempts] = useState<number | undefined>();
  const [lockedUntil, setLockedUntil] = useState<number | undefined>();
  const [autoSelected, setAutoSelected] = useState(false);

  // Get selected user details
  const activeUsers = useQuery(api.auth.queries.getActiveUsers);
  const selectedUser = activeUsers?.find(u => u._id === selectedUserId);

  // Pre-select whoever signed in last on this device, so the page opens
  // straight on the PIN pad. Runs at most once -- activeUsers is a live
  // subscription, and without the ref an update would snap the user back to
  // the PIN pad after they tapped "Login as someone else".
  const autoSelectAttempted = useRef(false);
  useEffect(() => {
    if (autoSelectAttempted.current || activeUsers === undefined) return;
    autoSelectAttempted.current = true;

    const storedId = getLastUserId();
    if (!storedId) return;

    // The stored id is device-controlled, so resolve it against the server
    // list rather than trusting it. No longer active (deactivated or deleted)
    // -- forget them and fall back to the grid.
    const lastUser = activeUsers.find(u => u._id === storedId);
    if (!lastUser) {
      clearLastUserId();
      return;
    }

    setSelectedUserId(lastUser._id);
    setAutoSelected(true);
  }, [activeUsers]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const landingPage = getRoleLandingPage(user.role);
      navigate(landingPage, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSelectUser = (userId: Id<"users">) => {
    setSelectedUserId(userId);
    setError(undefined);
    setRemainingAttempts(undefined);
    setLockedUntil(undefined);
  };

  const handleCancelPinEntry = () => {
    setSelectedUserId(null);
    setAutoSelected(false);
    setError(undefined);
    setRemainingAttempts(undefined);
    setLockedUntil(undefined);
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
                  aria-label="Login as someone else"
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
                cancelLabel={autoSelected ? "Login as someone else" : "Cancel"}
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
