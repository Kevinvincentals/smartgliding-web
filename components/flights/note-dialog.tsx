"use client";

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightId: string;
  originalId?: string;
  currentNotes: string | null;
  onNotesUpdated: (newNotes: string) => void;
  flightInfo?: {
    registration?: string;
    pilot1Name?: string;
    pilot2Name?: string;
    takeoffTime?: Date;
  };
}

export function NoteDialog({
  open,
  onOpenChange,
  flightId,
  originalId,
  currentNotes,
  onNotesUpdated,
  flightInfo,
}: NoteDialogProps) {
  const [notes, setNotes] = useState(currentNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Reset notes when dialog opens or currentNotes changes
  useEffect(() => {
    console.log('NoteDialog: currentNotes changed to:', currentNotes);
    setNotes(currentNotes || '');
  }, [currentNotes, open]);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/tablet/update_flight_notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flightId,
          originalId,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update notes');
      }

      onNotesUpdated(notes);
      onOpenChange(false);
      
      toast({
        title: 'Noter opdateret',
        description: 'Flyvningsnoter er blevet gemt.',
      });
    } catch (error) {
      console.error('Error updating notes:', error);
      toast({
        title: 'Fejl',
        description: error instanceof Error ? error.message : 'Kunne ikke opdatere noter',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(currentNotes || '');
    onOpenChange(false);
  };

  // Format flight info for display
  const formatFlightInfo = () => {
    if (!flightInfo) return 'Flyvningsnoter';
    
    const parts = [];
    if (flightInfo.registration) {
      parts.push(flightInfo.registration);
    }
    if (flightInfo.pilot1Name) {
      parts.push(flightInfo.pilot1Name);
      if (flightInfo.pilot2Name) {
        parts.push(`/ ${flightInfo.pilot2Name}`);
      }
    }
    if (flightInfo.takeoffTime) {
      const time = new Date(flightInfo.takeoffTime).toLocaleTimeString('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
      });
      parts.push(`(${time})`);
    }
    
    return parts.length > 0 ? `Noter - ${parts.join(' ')}` : 'Flyvningsnoter';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{formatFlightInfo()}</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="notes">Noter</Label>
            <Textarea
              id="notes"
              placeholder="Tilføj noter om denne flyvning..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[120px] resize-none"
              maxLength={1000}
            />
            <div className="text-xs text-muted-foreground text-right">
              {notes.length}/1000 tegn
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Annuller
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Gem Noter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
