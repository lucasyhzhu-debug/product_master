import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSoundsEnabled, setSoundsEnabled } from '@/lib/kitchenSounds';

export function SoundToggle() {
  // Initialize state from localStorage synchronously (avoids useEffect lint warning)
  const [enabled, setEnabled] = useState(() => getSoundsEnabled());

  const toggle = () => {
    const newValue = !enabled;
    setEnabled(newValue);
    setSoundsEnabled(newValue);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={enabled ? 'Mute sounds' : 'Unmute sounds'}
    >
      {enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
    </Button>
  );
}
