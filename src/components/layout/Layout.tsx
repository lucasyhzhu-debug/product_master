import { useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Header } from './Header';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { PageContainer } from './PageContainer';
import {
  FeedbackPanelToggle,
  FeedbackPanel,
  FeedbackCaptureMode,
  FeedbackForm,
} from '@/components/feedback';

interface LayoutProps {
  fullWidth?: boolean;
}

export function Layout({ fullWidth = false }: LayoutProps) {
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

  const content = fullWidth ? <Outlet /> : <PageContainer><Outlet /></PageContainer>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-14 pb-16 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {content}
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      <MobileBottomNav />

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
