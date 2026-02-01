import { useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import {
  FeedbackPanelToggle,
  FeedbackPanel,
  FeedbackCaptureMode,
  FeedbackForm,
} from '@/components/feedback';

export function Layout() {
  // Feedback overlay state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isCaptureMode, setIsCaptureMode] = useState(false);
  const [capturedData, setCapturedData] = useState<{
    blob: Blob;
    elementSelector: string;
  } | null>(null);

  const location = useLocation();

  // Reset feedback state on route change
  useEffect(() => {
    setIsPanelOpen(false);
    setIsCaptureMode(false);
    setCapturedData(null);
  }, [location.pathname]);

  // Handle starting capture mode
  const handleStartCapture = useCallback(() => {
    setIsPanelOpen(false);
    setIsCaptureMode(true);
  }, []);

  // Handle capture completion
  const handleCapture = useCallback((blob: Blob, elementSelector: string) => {
    setCapturedData({ blob, elementSelector });
    setIsCaptureMode(false);
  }, []);

  // Handle capture cancel
  const handleCancelCapture = useCallback(() => {
    setIsCaptureMode(false);
  }, []);

  // Handle form success
  const handleFormSuccess = useCallback(() => {
    setCapturedData(null);
    setIsPanelOpen(true);
  }, []);

  // Handle form cancel
  const handleFormCancel = useCallback(() => {
    setCapturedData(null);
  }, []);

  // Toggle panel
  const handleTogglePanel = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6">
        <Outlet />
      </main>

      {/* Feedback Overlay Components */}
      <FeedbackPanelToggle open={isPanelOpen} onToggle={handleTogglePanel} />

      <FeedbackPanel
        open={isPanelOpen}
        onOpenChange={setIsPanelOpen}
        onStartCapture={handleStartCapture}
      />

      <FeedbackCaptureMode
        isActive={isCaptureMode}
        onCapture={handleCapture}
        onCancel={handleCancelCapture}
      />

      {/* Feedback Form Modal (shown after capture) */}
      {capturedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg mx-4">
            <FeedbackForm
              capturedBlob={capturedData.blob}
              elementSelector={capturedData.elementSelector}
              onSuccess={handleFormSuccess}
              onCancel={handleFormCancel}
            />
          </div>
        </div>
      )}
    </div>
  );
}
