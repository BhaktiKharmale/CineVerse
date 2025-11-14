import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import "../../styles/SeatSelection.css";
import showtimeService, { 
  SeatInfo, 
  ShowtimeDetails,
  connectToSeatUpdates,
  disconnectFromSeatUpdates,
  removeSeatUpdateListeners 
} from "../../services/showtimeService";
import { useBooking } from "../../context/BookingContext";
import paymentService from "../../services/paymentService";
import Loader from "../../components/common/Loader";

/* ---------------------- Types & helpers ---------------------- */

interface SeatWithSelection extends Omit<SeatInfo, "id" | "number" | "row" | "label" | "status"> {
  id: number;
  number: number;
  row: string;
  label: string;
  status: string;
  isSelected?: boolean;
  zone?: string;
  price?: number;
  raw?: any;
  lockedBy?: string;
  [k: string]: any;
}

const seatDisplayNumber = (s: SeatWithSelection, zone?: string, sofaIndex?: number) =>
  zone === "royal_sofa" && typeof sofaIndex === "number" ? `R${sofaIndex + 1}` : String(s.number ?? s.label ?? s.id ?? "");

const seatRow = (s: SeatWithSelection) => String(s.row ?? "A").toUpperCase();

const getIdNumber = (s: any): number => {
  if (!s) return NaN;
  
  const possibleId = s.id ?? s.seatId ?? s.seat_id ?? s.number;
  
  if (typeof possibleId === 'number') return possibleId;
  if (typeof possibleId === 'string') {
    const num = Number(possibleId);
    if (!isNaN(num)) return num;
  }
  
  const row = String(s.row ?? "A");
  const num = Number(s.number ?? 1);
  return (row.charCodeAt(0) * 1000) + num;
};

const getOwnerToken = (): string => {
  const key = "cineverse_owner_token";
  try {
    let existing = localStorage.getItem(key);
    if (existing && existing.length >= 10 && existing.length <= 100) {
      return existing;
    }
    
    const generateUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
    
    const tok = generateUUID();
    localStorage.setItem(key, tok);
    return tok;
  } catch (error) {
    console.warn('localStorage unavailable, using session token');
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
};

const slugify = (s?: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

function extractFilenameFromAnyPath(p?: string): string {
  if (!p) return "";
  return p.replace(/\\/g, "/").split("/").pop() || "";
}

/* ---------------------- Poster utilities ---------------------- */

function buildPosterCandidates(meta?: ShowtimeDetails | null) {
  const m: any = (meta as any)?.movie ?? (meta as any) ?? {};
  const possible = m?.poster_url ?? m?.poster ?? (meta as any)?.poster_url ?? (meta as any)?.poster;
  const filename = extractFilenameFromAnyPath(possible);
  const slug = slugify(m?.title ?? (meta as any)?.title ?? "");
  const base = "/images";
  const candidates: string[] = [];

  if (filename) candidates.push(`${base}/${filename}`, `${base}/${encodeURIComponent(filename)}`);
  if (slug) {
    candidates.push(`${base}/${slug}.webp`, `${base}/${slug}.jpg`, `${base}/${slug}.jpeg`, `${base}/${slug}.png`);
  }
  candidates.push(`${base}/placeholder.jpg`, `${base}/placeholder.png`, `${base}/placeholder-poster.png`);
  return Array.from(new Set(candidates));
}

const PosterImage: React.FC<{ meta?: ShowtimeDetails | null; alt: string; style?: React.CSSProperties }> = ({ meta, alt, style }) => {
  const candidates = useMemo(() => buildPosterCandidates(meta), [meta]);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(null);
  }, [meta]);

  useEffect(() => {
    if (!candidates || candidates.length === 0) return;
    let cancelled = false;
    const tryLoad = (i: number) => {
      if (i >= candidates.length) {
        if (!cancelled) setSrc(null);
        return;
      }
      const url = candidates[i];
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setSrc(url);
      };
      img.onerror = () => {
        if (!cancelled) tryLoad(i + 1);
      };
      img.src = url;
    };
    tryLoad(0);
    return () => {
      cancelled = true;
    };
  }, [candidates]);

  if (!candidates || candidates.length === 0) return null;
  if (src) return <img src={src} alt={alt} style={style} />;
  return (
    <div
      aria-hidden
      style={{
        width: style?.width ?? 85,
        height: style?.height ?? 120,
        borderRadius: (style?.borderRadius as any) ?? 12,
        background: "#111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#666",
        fontSize: 12,
        ...style,
      }}
    >
      poster
    </div>
  );
};

/* ---------------------- Legend Box Component ---------------------- */

const LegendBox: React.FC<{ color: string; label: string; border?: boolean }> = ({ color, label, border }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <div
      style={{
        width: 20,
        height: 20,
        background: color,
        border: border ? "2px solid var(--seat-border)" : "none",
        borderRadius: 4,
      }}
    />
    <div style={{ color: "var(--muted)", fontSize: 14 }}>{label}</div>
  </div>
);

/* ---------------------- Zones ---------------------- */

const ZONE_MAP: Record<string, string> = {
  sofa: "royal_sofa",
  recliner: "royal_sofa",
  premium: "royal_gold",
  gold: "royal_gold",
  regular: "royal_silver",
  silver: "royal_silver",
  standard: "royal_silver",
};

const zoneOrder = ["royal_sofa", "royal_gold", "royal_silver"];
const zoneLabels: Record<string, string> = {
  royal_sofa: "ROYAL SOFA",
  royal_gold: "ROYAL GOLD",
  royal_silver: "ROYAL SILVER",
};

/* ---------------------- Component ---------------------- */
const SeatSelection: React.FC = () => {
  const { showtimeId } = useParams();
  const navigate = useNavigate();

  const {
    movieId,
    showtimeId: ctxShowtimeId,
    lockId,
    expiresAt,
    seats: lockedSeats,
    setLock,
    clearLock,
    setOrder,
    reset,
  } = useBooking();

  const [meta, setMeta] = useState<ShowtimeDetails | null>(null);
  const [seats, setSeats] = useState<SeatWithSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockExpiry, setLockExpiry] = useState<string | null>(expiresAt ?? null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const shouldReleaseLockRef = useRef(true);
  const [isLocking, setIsLocking] = useState(false);
  const unlockInProgressRef = useRef(false); // Prevent multiple simultaneous unlock calls

  // WebSocket state
  const [connectionStatus, setConnectionStatus] = useState<string>('DISCONNECTED');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const activeShowtimeId = showtimeId ?? (ctxShowtimeId ? String(ctxShowtimeId) : null);
  const currentOwner = getOwnerToken();

  // Single source of truth for selected seats
  const selectedSeats = useMemo(() => seats.filter((s) => !!s.isSelected), [seats]);
  const totalAmount = useMemo(() => selectedSeats.reduce((sum, s) => sum + (s.price ?? 0), 0), [selectedSeats]);

  // Track if we're in the middle of a lock operation to prevent unnecessary re-fetches
  const isLockingRef = useRef(false);
  const lastLockedSeatsRef = useRef<typeof lockedSeats>(null);

  /* ---------------------- Load meta + seats (ONLY on showtime change) ---------------------- */
  useEffect(() => {
    if (!activeShowtimeId) {
      navigate("/movies", { replace: true });
      return;
    }
    
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [metaResp, seatResp] = await Promise.allSettled([
          showtimeService.getShowtimeDetails(activeShowtimeId),
          showtimeService.getSeatMap(activeShowtimeId),
        ]);
        
        if (metaResp.status === 'fulfilled') {
          setMeta(metaResp.value);
        } else {
          console.error('Failed to load showtime details:', metaResp.reason);
        }
        
        if (seatResp.status === 'fulfilled') {
          console.log('Seat response:', seatResp.value);

          const rawSeats = Array.isArray(seatResp.value?.seats) ? seatResp.value.seats : [];
          
          // Use context's locked seats to determine initial selection
          const lockedSeatIds = new Set((lockedSeats ?? []).map((x: any) => String(getIdNumber(x))));

          console.log('Raw seats count:', rawSeats.length);
          console.log('Locked seat IDs from context:', Array.from(lockedSeatIds));

          const mapped: SeatWithSelection[] = rawSeats.map((r: any, idx: number) => {
            const rawZone = String((r.zone ?? r.section ?? r.category ?? "")).toLowerCase();
            const mappedZone = ZONE_MAP[rawZone] ?? (rawZone ? rawZone : "royal_silver");

            const idNum = getIdNumber(r);
            
            const num = (() => {
              const cand = r.number ?? r.num ?? r.no ?? r.label ?? r.seatNumber ?? idNum;
              const n = Number(cand);
              return !isNaN(n) && isFinite(n) ? n : idNum;
            })();

            const rowStr = String(r.row ?? r.r ?? r.row_label ?? r.rowName ?? "A").toUpperCase();

            const price = (() => {
              const p = r.price ?? r.cost ?? (metaResp.status === 'fulfilled' ? (metaResp.value as any)?.pricing?.[mappedZone] : null) ?? 
                       (mappedZone === "royal_sofa" ? 400 : 
                        mappedZone === "royal_gold" ? 350 : 250);
              const n = Number(p);
              return !isNaN(n) && isFinite(n) ? n : 0;
            })();

            const label = String(r.label ?? `${rowStr}${num}`);
            
            // Sync with context state
            const isSelected = lockedSeatIds.has(String(idNum));

            console.log(`Seat ${label}: id=${idNum}, selected=${isSelected}`);

            return {
              ...(r as SeatInfo),
              id: idNum,
              number: num,
              row: rowStr,
              zone: mappedZone,
              status: String(r.status ?? r.state ?? "available"),
              price,
              label,
              isSelected: isSelected,
              lockedBy: r.lockedBy ?? r.locked_by,
              raw: r,
            } as SeatWithSelection;
          });

          console.log('Mapped seats:', mapped);
          setSeats(mapped);
          lastLockedSeatsRef.current = lockedSeats;
        } else {
          console.error('Failed to load seat map:', seatResp.reason);
          setError("Unable to load seat map. Please try again.");
          setSeats([]);
        }
      } catch (e) {
        console.error('Seat loading error:', e);
        setError("Unable to load seat map. Please try again.");
        setSeats([]);
      } finally {
        setLoading(false);
      }
    };
    
    load();
  }, [activeShowtimeId, navigate]); // REMOVED lockedSeats from dependencies to prevent unnecessary re-fetches

  /* ---------------------- Sync selection state when lockedSeats changes (WITHOUT re-fetching) ---------------------- */
  useEffect(() => {
    // Only sync if we're not currently locking and lockedSeats actually changed
    if (isLockingRef.current) {
      console.log('[SeatSelection] Skipping selection sync - lock operation in progress');
      return;
    }

    // Check if lockedSeats actually changed
    const currentLockedIds = new Set((lockedSeats ?? []).map((x: any) => String(getIdNumber(x))));
    const prevLockedIds = new Set((lastLockedSeatsRef.current ?? []).map((x: any) => String(getIdNumber(x))));
    
    // Compare sets
    const idsChanged = currentLockedIds.size !== prevLockedIds.size || 
      Array.from(currentLockedIds).some(id => !prevLockedIds.has(id)) ||
      Array.from(prevLockedIds).some(id => !currentLockedIds.has(id));

    if (!idsChanged) {
      return; // No change, skip update
    }

    console.log('[SeatSelection] Syncing selection state from context (no API call)');
    
    // Update selection state without re-fetching from API
    setSeats(prev => prev.map(seat => {
      const seatIdStr = String(seat.id);
      const shouldBeSelected = currentLockedIds.has(seatIdStr);
      
      // Only update if selection state actually changed
      if (seat.isSelected !== shouldBeSelected) {
        return {
          ...seat,
          isSelected: shouldBeSelected,
          // If being selected, ensure status reflects lock
          status: shouldBeSelected && seat.status === 'available' ? 'locked' : seat.status,
          lockedBy: shouldBeSelected ? currentOwner : (seat.lockedBy === currentOwner ? undefined : seat.lockedBy),
        };
      }
      return seat;
    }));

    lastLockedSeatsRef.current = lockedSeats;
  }, [lockedSeats, currentOwner]);

  /* ---------------------- Countdown ---------------------- */
  useEffect(() => {
    if (!lockExpiry) {
      setRemainingSeconds(null);
      return;
    }
    const expiryTime = new Date(lockExpiry).getTime();
    const tick = () => {
      const diff = Math.floor((expiryTime - Date.now()) / 1000);
      setRemainingSeconds(diff > 0 ? diff : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockExpiry]);

  /* ---------------------- Auto extend ---------------------- */
  useEffect(() => {
    // Only extend real locks (not temp selections)
    const shouldExtend = remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds < 30;
    if (!shouldExtend || !lockId || !activeShowtimeId || lockId.toString().startsWith('temp-')) return;
    
    (async () => {
      try {
        const resp = await showtimeService.extendLock(activeShowtimeId, { 
          lockId,
          owner: currentOwner,
          seatIds: selectedSeats.map(s => s.id)
        });
        
        const newExpiry = (resp as any).expiresAt ?? new Date(Date.now() + 180000).toISOString();
        setLock(lockId, newExpiry, selectedSeats.map(s => ({
          seatId: s.id,
          label: s.label,
          price: s.price ?? 0,
        })));
        setLockExpiry(newExpiry);
        
        console.log('Lock extended successfully');
      } catch (error) {
        console.warn("Failed to extend lock:", error);
      }
    })();
  }, [remainingSeconds, lockId, activeShowtimeId, setLock, currentOwner, selectedSeats]);

  // Use refs to track current values for cleanup
  const lockIdRef = useRef(lockId);
  const activeShowtimeIdRef = useRef(activeShowtimeId);
  const currentOwnerRef = useRef(currentOwner);
  
  // Update refs when values change
  useEffect(() => {
    lockIdRef.current = lockId;
    activeShowtimeIdRef.current = activeShowtimeId;
    currentOwnerRef.current = currentOwner;
  }, [lockId, activeShowtimeId, currentOwner]);

  /* ---------------------- Release lock on unmount ---------------------- */
  useEffect(() => {
    return () => {
      // Use refs to get current values in cleanup
      const currentLockId = lockIdRef.current;
      const currentShowtimeId = activeShowtimeIdRef.current;
      const currentOwnerValue = currentOwnerRef.current;
      
      // Only release lock if:
      // 1. We should release (not navigating to checkout)
      // 2. We have a real lock (not temp selection)
      // 3. We're not in the middle of locking
      if (shouldReleaseLockRef.current && currentLockId && !currentLockId.toString().startsWith('temp-') && !isLockingRef.current) {
        // Prevent multiple simultaneous unlock calls
        if (!unlockInProgressRef.current) {
          unlockInProgressRef.current = true;
          showtimeService.unlockSeats(currentShowtimeId || '', { 
            owner: currentOwnerValue 
          }).catch(() => null).finally(() => {
            unlockInProgressRef.current = false;
          });
        }
      }
      // Clear lock context (but don't disconnect WebSocket here - let WebSocket useEffect handle it)
      clearLock({ silent: true }).catch(() => null);
    };
    // Only run cleanup on unmount - use refs for current values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only cleanup on unmount

  /* ---------------------- IMPROVED WebSocket Updates ---------------------- */
  useEffect(() => {
    if (!activeShowtimeId) return;

    console.log('[SeatSelection] Setting up WebSocket for real-time updates');

    const handleSeatUpdate = (updatedSeats: any[]) => {
      if (!Array.isArray(updatedSeats)) return;
      
      console.log('[SeatSelection] Received seat update:', updatedSeats.length, 'seats');
      setLastUpdate(new Date());
      
      // Use functional update to access current seats state
      setSeats(prev => {
        // Get current selected seat IDs to preserve selection state
        const selectedSeatIds = new Set(
          prev.filter(s => s.isSelected).map(s => String(s.id))
        );
        
        // Also check context for locked seats
        const contextLockedIds = new Set((lockedSeats ?? []).map((s: any) => String(getIdNumber(s))));
        
        return prev.map(currentSeat => {
          const updatedSeat = updatedSeats.find(us => 
            getIdNumber(us) === getIdNumber(currentSeat)
          );
          
          if (updatedSeat) {
            const updatedSeatId = getIdNumber(updatedSeat);
            const currentSeatId = getIdNumber(currentSeat);
            
            // Match by ID (handle different ID formats)
            if (updatedSeatId === currentSeatId || 
                String(updatedSeat.id ?? updatedSeat.seat_id) === String(currentSeat.id) ||
                String(updatedSeat.id ?? updatedSeat.seat_id) === String(currentSeat.seatId)) {
              const isLockedByOthers = updatedSeat.status === 'locked' && 
                                     (updatedSeat.locked_by ?? updatedSeat.lockedBy) && 
                                     (updatedSeat.locked_by ?? updatedSeat.lockedBy) !== currentOwner;
              const wasSelectedByUs = selectedSeatIds.has(String(currentSeat.id));
              const isInContext = contextLockedIds.has(String(currentSeat.id));
              
              if (isLockedByOthers && wasSelectedByUs) {
                console.warn(`[SeatSelection] Our selected seat ${currentSeat.label} was locked by someone else!`);
                toast.error(`Seat ${currentSeat.label} was taken by another user.`);
              }
              
              // Preserve selection state unless locked by others
              // Check both current selection and context
              const shouldBeSelected = !isLockedByOthers && (wasSelectedByUs || isInContext);
              
              return {
                ...currentSeat,
                status: updatedSeat.status,
                lockedBy: updatedSeat.locked_by ?? updatedSeat.lockedBy,
                isSelected: shouldBeSelected
              };
            }
          }
          return currentSeat;
        });
      });
    };

    const handleSeatLocked = (payload: any) => {
      setLastUpdate(new Date());
      console.log('[SeatSelection] Seat locked event received:', payload);
      
      // Extract seat data from payload
      const seatData = payload?.seat ?? payload;
      if (!seatData) {
        console.warn('[SeatSelection] Invalid seat_locked payload:', payload);
        return;
      }
      
      const lockedSeatId = getIdNumber(seatData);
      const lockedBy = seatData.locked_by ?? seatData.lockedBy ?? seatData.owner;
      
      console.log('[SeatSelection] Processing seat lock:', { 
        seatId: lockedSeatId, 
        lockedBy, 
        currentOwner,
        isLockedByOthers: lockedBy && lockedBy !== currentOwner
      });
      
      // Use functional update to access current seats state
      setSeats(prev => {
        // Get current selected seat IDs to preserve selection state
        const selectedSeatIds = new Set(
          prev.filter(s => s.isSelected).map(s => String(s.id))
        );
        
        // Also check context for locked seats
        const contextLockedIds = new Set((lockedSeats ?? []).map((s: any) => String(getIdNumber(s))));
        
        let found = false;
        const updated = prev.map(s => {
          const currentSeatId = getIdNumber(s);
          
          // Match by ID (handle different ID formats)
          if (currentSeatId === lockedSeatId || 
              String(s.id) === String(lockedSeatId) ||
              String(s.seatId) === String(lockedSeatId) ||
              String(seatData.seat_id) === String(s.id) ||
              String(seatData.seat_id) === String(s.seatId)) {
            found = true;
            const isLockedByOthers = lockedBy && lockedBy !== currentOwner;
            const wasSelectedByUs = selectedSeatIds.has(String(s.id));
            const isInContext = contextLockedIds.has(String(s.id));
            
            console.log('[SeatSelection] Updating seat:', {
              label: s.label,
              wasSelectedByUs,
              isLockedByOthers,
              lockedBy,
              currentOwner
            });
            
            if (isLockedByOthers && wasSelectedByUs) {
              toast.error(`Seat ${s.label} was just taken by another user.`);
              return { 
                ...s, 
                status: 'locked', 
                lockedBy: lockedBy,
                isSelected: false 
              };
            }
            
            // Preserve selection if locked by us, or check context
            const shouldBeSelected = !isLockedByOthers && (wasSelectedByUs || isInContext);
            
            return { 
              ...s, 
              status: 'locked',
              lockedBy: lockedBy,
              isSelected: shouldBeSelected
            };
          }
          return s;
        });
        
        if (!found) {
          console.warn('[SeatSelection] Seat not found in local state:', lockedSeatId, 'Available IDs:', prev.map(s => getIdNumber(s)));
        }
        
        return updated;
      });
    };

    const handleSeatReleased = (payload: any) => {
      setLastUpdate(new Date());
      console.log('[SeatSelection] Seat released event received:', payload);
      
      // Extract seat data from payload
      const seatData = payload?.seat ?? payload;
      if (!seatData) {
        console.warn('[SeatSelection] Invalid seat_released payload:', payload);
        return;
      }
      
      const releasedSeatId = getIdNumber(seatData);
      console.log('[SeatSelection] Processing seat release:', { seatId: releasedSeatId });
      
      setSeats(prev => {
        let found = false;
        const updated = prev.map(s => {
          const currentSeatId = getIdNumber(s);
          
          // Match by ID (handle different ID formats)
          if (currentSeatId === releasedSeatId || 
              String(s.id) === String(releasedSeatId) ||
              String(s.seatId) === String(releasedSeatId) ||
              String(seatData.seat_id) === String(s.id) ||
              String(seatData.seat_id) === String(s.seatId)) {
            found = true;
            console.log('[SeatSelection] Releasing seat:', s.label);
            return { 
              ...s, 
              status: 'available',
              lockedBy: undefined
            };
          }
          return s;
        });
        
        if (!found) {
          console.warn('[SeatSelection] Seat not found for release:', releasedSeatId);
        }
        
        return updated;
      });
    };

    const handleError = (error: string) => {
      console.warn('[SeatSelection] WebSocket error:', error);
      if (error.includes('Unable to establish') || error.includes('Authentication failed')) {
        toast.error('Real-time updates unavailable. Your seat selection is preserved.', {
          duration: 6000,
        });
      } else if (error.includes('403') || error.includes('Forbidden')) {
        toast.error('Authentication required for real-time updates.', {
          duration: 6000,
        });
      }
    };
    
    const handleConnected = () => {
      console.log('[SeatSelection] WebSocket connected');
      setConnectionStatus('CONNECTED');
    };

    const handleDisconnected = () => {
      console.log('[SeatSelection] WebSocket disconnected, but preserving seat selection...');
      setConnectionStatus('DISCONNECTED');
      toast.error('Real-time updates disconnected. Your seat selection is preserved.', {
        duration: 4000,
      });
    };

    // Connect to WebSocket - use the cleanup function returned
    const cleanup = connectToSeatUpdates(activeShowtimeId, {
      onSeatUpdate: handleSeatUpdate,
      onSeatLocked: handleSeatLocked,
      onSeatReleased: handleSeatReleased,
      onError: handleError,
      onConnected: handleConnected,
      onDisconnected: handleDisconnected,
    });

    // Cleanup - use the returned cleanup function for proper cleanup
    return () => {
      console.log('[SeatSelection] Cleaning up WebSocket listeners');
      if (cleanup && typeof cleanup === 'function') {
        cleanup(); // Use the cleanup function from connectToSeatUpdates
      } else {
        // Fallback to manual cleanup
        removeSeatUpdateListeners({
          onSeatUpdate: handleSeatUpdate,
          onSeatLocked: handleSeatLocked,
          onSeatReleased: handleSeatReleased,
          onError: handleError,
          onConnected: handleConnected,
          onDisconnected: handleDisconnected,
        });
      }
    };
    // Only depend on showtimeId - WebSocket should connect once per showtime
    // Removed currentOwner and lockedSeats to prevent reconnections on seat selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShowtimeId]); // Only reconnect if showtimeId changes

  const formatTimer = () => {
    if (!lockExpiry || remainingSeconds === null) return "--:--";
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  /* ---------------------- FIXED: Toggle & lock seats ---------------------- */
  const toggleSeat = async (seat: SeatWithSelection, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent?.stopImmediatePropagation();
    }
    
    console.log('Toggle seat called:', seat.label, 'id:', seat.id, 'current selected:', seat.isSelected);
    
    if (!activeShowtimeId || isLocking) {
      console.log('Cannot toggle: no showtime ID or already locking');
      return;
    }
    
    // Enhanced status check with owner awareness
    const isLockedByOthers = seat.status === "locked" && seat.lockedBy !== currentOwner;
    if (seat.status === "booked" || seat.status === "blocked" || isLockedByOthers) {
      console.log('Seat not available:', { status: seat.status, lockedByOthers: isLockedByOthers });
      if (isLockedByOthers) {
        toast.error("This seat was just taken by another user.");
      } else {
        toast.error("Seat not available.");
      }
      return;
    }
  
    setIsLocking(true);
    isLockingRef.current = true; // Mark that we're locking to prevent re-fetches
    console.log('Starting seat toggle process...');
  
    try {
      const isDeselecting = !!seat.isSelected;
      console.log('Is deselecting:', isDeselecting);
      
      if (isDeselecting) {
        // DESELECTING: Update UI immediately and unlock
        console.log('Deselecting seat:', seat.label);
        
        // Update local state first
        const updatedSeats = seats.map(p => 
          p.id === seat.id ? { ...p, isSelected: false, status: "available", lockedBy: undefined } : p
        );
        setSeats(updatedSeats);
        
        const remainingSelection = selectedSeats.filter(x => x.id !== seat.id);
        
        console.log('Remaining seats after deselect:', remainingSelection.length);
        
        if (remainingSelection.length === 0) {
          // No seats left, clear all locks if they exist
          console.log('No seats left, clearing locks if any');
          
          // Only unlock if we have an actual lock (not just temp selection)
          if (lockId && !lockId.toString().startsWith('temp-')) {
            // Prevent multiple simultaneous unlock calls
            if (!unlockInProgressRef.current) {
              unlockInProgressRef.current = true;
              try {
                await showtimeService.unlockSeats(activeShowtimeId, { 
                  owner: currentOwner 
                });
                setLockExpiry(null);
                // Clear context lock
                await clearLock({ silent: true });
              } catch (err) {
                console.warn('Failed to unlock seats:', err);
                // Continue anyway - best effort
              } finally {
                unlockInProgressRef.current = false;
              }
            }
          } else {
            // Just clear context for temp selections
            await clearLock({ silent: true });
            setLockExpiry(null);
          }
        } else {
          // Update context with remaining seats and unlock the deselected seat
          const remainingSeatsForContext = remainingSelection.map(item => ({
            seatId: item.id,
            label: item.label,
            price: item.price ?? 0,
          }));
          
          console.log('Updating selection with remaining seats:', remainingSeatsForContext);
          
          // If we have a real lock, unlock the deselected seat and update context
          if (lockId && !lockId.toString().startsWith('temp-') && lockExpiry) {
            // Unlock the deselected seat (this will broadcast to other users)
            try {
              await showtimeService.unlockSeats(activeShowtimeId, {
                owner: currentOwner,
                seatIds: [seat.id], // Unlock just this seat
              });
              console.log('Seat unlocked and broadcasted to other users');
            } catch (unlockErr) {
              console.warn('Failed to unlock deselected seat:', unlockErr);
              // Continue anyway - best effort
            }
            
            // Update context with remaining seats
            setLock(lockId, lockExpiry, remainingSeatsForContext);
          } else {
            // Temp selection - just update context
            const tempLockId = `temp-${Date.now()}`;
            const tempExpiry = new Date(Date.now() + 180000).toISOString();
            setLock(tempLockId, tempExpiry, remainingSeatsForContext);
          }
        }
      } else {
        // SELECTING: Lock seat immediately for real-time availability
        console.log('Selecting seat:', seat.label);
        
        // Check if seat is already selected (prevent duplicates)
        // Check both selectedSeats and current seats state to handle race conditions
        const alreadySelected = selectedSeats.some(s => s.id === seat.id) || 
                               seats.find(s => s.id === seat.id)?.isSelected;
        if (alreadySelected) {
          console.log('Seat already selected, skipping');
          return;
        }
        
        // Immediate optimistic UI update (local selection)
        const updatedSeats = seats.map(p =>
          p.id === seat.id 
            ? { ...p, isSelected: true, status: "locked", lockedBy: currentOwner }
            : p
        );
        setSeats(updatedSeats);
        
        // Use updated seats array to compute nextSelected to avoid duplicates
        const nextSelected = [...selectedSeats, { ...seat, isSelected: true }];
        console.log('Next selected seats:', nextSelected.map(s => s.label));
        
        // Lock seat immediately via API (this will broadcast to other users)
        try {
          const seatIds = nextSelected.map(s => s.id);
          const lockResp = await showtimeService.lockSeats(activeShowtimeId, {
            owner: currentOwner,
            seatIds: seatIds,
            ttlMs: 180000, // 3 minutes
          });
          
          console.log('Seats locked successfully:', lockResp);
          
          // Handle conflicts (seat was taken by someone else)
          if (lockResp.conflicts && lockResp.conflicts.length > 0) {
            const conflictIds = lockResp.conflicts.map((c: any) => c.seatId ?? c.seat_id ?? c);
            const conflictedSeat = nextSelected.find(s => conflictIds.includes(s.id));
            
            if (conflictedSeat) {
              toast.error(`Seat ${conflictedSeat.label} was just taken by another user.`);
              // Remove conflicted seat from selection
              const availableSeats = nextSelected.filter(s => !conflictIds.includes(s.id));
              setSeats(prev => prev.map(p => 
                conflictIds.includes(p.id)
                  ? { ...p, isSelected: false, status: "locked", lockedBy: undefined }
                  : p
              ));
              
              if (availableSeats.length === 0) {
                await clearLock({ silent: true });
                setLockExpiry(null);
                return;
              }
              
              // Update context with available seats only
              const seatsForContext = availableSeats.map(item => ({
                seatId: item.id,
                label: item.label,
                price: item.price ?? 0,
              }));
              
              if (lockResp.lockId && lockResp.expiresAt) {
                setLock(lockResp.lockId, lockResp.expiresAt, seatsForContext);
                setLockExpiry(lockResp.expiresAt);
              }
              return;
            }
          }
          
          // Success - update context with real lock
          const seatsForContext = nextSelected.map(item => ({
            seatId: item.id,
            label: item.label,
            price: item.price ?? 0,
          }));
          
          if (lockResp.lockId && lockResp.expiresAt) {
            setLock(lockResp.lockId, lockResp.expiresAt, seatsForContext);
            setLockExpiry(lockResp.expiresAt);
            
            // Update seat status to locked
            setSeats(prev => prev.map(p => 
              nextSelected.some(s => s.id === p.id)
                ? { ...p, status: "locked", lockedBy: currentOwner, isSelected: true }
                : p
            ));
          }
          
          console.log('Seat locked and broadcasted to other users');
        } catch (lockError: any) {
          console.error('Failed to lock seat:', lockError);
          
          // Handle conflict errors
          if (lockError?.response?.status === 409) {
            const conflictData = lockError?.response?.data;
            const conflictIds = conflictData?.conflicts?.map((c: any) => c.seatId ?? c.seat_id ?? c) ?? [];
            
            if (conflictIds.includes(seat.id)) {
              toast.error(`Seat ${seat.label} was just taken by another user.`);
              // Revert selection
              setSeats(prev => prev.map(p => 
                p.id === seat.id 
                  ? { ...p, isSelected: false, status: "locked" }
                  : p
              ));
              return;
            }
          }
          
          // For other errors, still allow selection but show warning
          toast.error("Unable to lock seat. Please try again.");
          
          // Store selection in context with temporary lock ID (will retry at checkout)
          const seatsForContext = nextSelected.map(item => ({
            seatId: item.id,
            label: item.label,
            price: item.price ?? 0,
          }));
          
          const tempLockId = `temp-${Date.now()}`;
          const tempExpiry = new Date(Date.now() + 180000).toISOString();
          setLock(tempLockId, tempExpiry, seatsForContext);
        }
      }
    } catch (err: any) {
      console.error("Seat locking error:", err);
      
      if (err?.response?.status === 409) {
        toast.error("Some seats are no longer available. Please select different seats.");
      } else if (err?.response?.status === 503) {
        toast.error("Seat locking service temporarily unavailable. Please try again.");
      } else {
        toast.error(err?.message || "Unable to lock seats. Please try again.");
      }
    } finally {
      setIsLocking(false);
      isLockingRef.current = false; // Clear lock flag
      console.log('Seat toggle process completed');
    }
  };

  /* ---------------------- FIXED: Proceed to checkout ---------------------- */
  const proceedToCheckout = async () => {
    if (!activeShowtimeId || selectedSeats.length === 0) {
      toast.error("Select seats to continue.");
      return;
    }

    try {
      setSummaryLoading(true);
      setIsLocking(true);
      isLockingRef.current = true;

      // STEP 1: Ensure seats are locked (they should already be locked from selection, but extend lock if needed)
      console.log('Proceeding to checkout with seats:', selectedSeats.map(s => s.id));
      const seatIds = selectedSeats.map(s => s.id);
      
      // If we have a real lock (not temp), extend it; otherwise lock now
      let lockResp;
      if (lockId && !lockId.toString().startsWith('temp-') && lockExpiry) {
        // Seats are already locked, just extend the lock
        console.log('Extending existing lock:', lockId);
        try {
          const extendResp = await showtimeService.extendLock(activeShowtimeId, {
            lockId,
            owner: currentOwner,
            seatIds: seatIds,
            ttlMs: 180000, // 3 minutes to complete payment
          });
          
          lockResp = {
            lockId: lockId,
            expiresAt: extendResp.expiresAt || lockExpiry,
            seats: selectedSeats.map(s => ({ seatId: s.id, status: "locked" })),
          };
          
          setLockExpiry(extendResp.expiresAt || lockExpiry);
        } catch (extendError: any) {
          console.warn('Failed to extend lock, will try to lock again:', extendError);
          // Fall through to lock again
        }
      }
      
      // If we don't have a valid lock, lock now
      if (!lockResp) {
        console.log('Locking seats before checkout:', seatIds);
        try {
          lockResp = await showtimeService.lockSeats(activeShowtimeId, {
            owner: currentOwner,
            seatIds: seatIds,
            ttlMs: 180000, // 3 minutes to complete payment
          });

          console.log('Lock response:', lockResp);

          // Handle conflicts
          if (lockResp.conflicts && lockResp.conflicts.length > 0) {
            console.warn('Lock conflicts detected:', lockResp.conflicts);
            const conflictIds = lockResp.conflicts.map((c: any) => c.seatId ?? c.seat_id ?? c);
            
            // Remove conflicted seats from selection
            const availableSeats = selectedSeats.filter(s => !conflictIds.includes(s.id));
            
            if (availableSeats.length === 0) {
              toast.error("All selected seats were taken. Please select different seats.");
              await clearLock({ silent: true }).catch(() => null);
              setSeats(prev => prev.map(p => ({ ...p, isSelected: false })));
              return;
            }
            
            // Update selection to remove conflicted seats
            setSeats(prev => prev.map(p => 
              conflictIds.includes(p.id)
                ? { ...p, isSelected: false, status: "locked", lockedBy: undefined }
                : p
            ));
            
            toast.error("Some seats were taken. Please proceed with remaining seats or select different ones.");
            
            // Update selected seats to available ones
            const seatsForContext = availableSeats.map(item => ({
              seatId: item.id,
              label: item.label,
              price: item.price ?? 0,
            }));
            
            setLock(lockResp.lockId, lockResp.expiresAt, seatsForContext);
            setLockExpiry(lockResp.expiresAt);
            
            // Continue with available seats - update selectedSeats reference
            // Note: This won't update the component state immediately, but validation will catch it
          } else {
            // Success - update context state with real lock
            const seatsForContext = selectedSeats.map(item => ({
              seatId: item.id,
              label: item.label,
              price: item.price ?? 0,
            }));
            
            setLock(lockResp.lockId, lockResp.expiresAt, seatsForContext);
            setLockExpiry(lockResp.expiresAt);
          }
        } catch (lockError: any) {
          console.error('Lock API error:', lockError);
          const status = lockError?.response?.status;
          
          if (status === 409) {
            toast.error("Some seats are no longer available. Please reselect seats.");
          } else if (status === 503) {
            toast.error("Seat locking service temporarily unavailable. Please try again.");
          } else {
            toast.error(lockError?.message || "Unable to lock seats. Please try again.");
          }
          
          await clearLock({ silent: true }).catch(() => null);
          return;
        }
      }

      // STEP 2: Validate locks (double-check before creating order)
      const validation: any = await paymentService.validateLocks({
        showtimeId: activeShowtimeId,
        lockId: lockResp.lockId,
        owner: currentOwner,
        seats: selectedSeats.map(s => ({ seatId: s.id })),
      });

      if (!validation?.valid) {
        toast.error(validation?.reason ?? "Seat lock validation failed. Please reselect seats.");
        await clearLock({ silent: true }).catch(() => null);
        return;
      }

      // STEP 3: Create order (seats are now locked)
      const order: any = await paymentService.createOrder({
        showtimeId: activeShowtimeId,
        lockId: lockResp.lockId,
        owner: currentOwner,
        seats: selectedSeats.map(s => ({ 
          seatId: s.id, 
          price: s.price ?? 0 
        })),
      });

      setOrder(order.orderId);
      shouldReleaseLockRef.current = false; // Don't release lock on unmount - payment is in progress

      // Navigate to checkout
      navigate(`/booking/checkout/${order.orderId}`, {
        state: { 
          order, 
          showtimeId: activeShowtimeId, 
          seats: selectedSeats.map(s => ({ 
            seatId: s.id, 
            price: s.price ?? 0 
          }))
        },
        replace: true
      });
    } catch (err: any) {
      const status = err?.response?.status;
      
      if (status === 409) {
        toast.error("Some seats are no longer available. Please reselect seats.");
        await clearLock({ silent: true });
      } else if (status === 503) {
        toast.error("Service temporarily unavailable. Please try again.");
      } else {
        toast.error(err.response?.data?.message || "Unable to proceed to checkout.");
      }
    } finally {
      setSummaryLoading(false);
      setIsLocking(false);
      isLockingRef.current = false;
    }
  };

  /* ---------------------- Expiration handling ---------------------- */
  useEffect(() => {
    // Only handle expiration for real locks (not temp selections)
    if (remainingSeconds === 0 && lockId && !lockId.toString().startsWith('temp-')) {
      toast.error("Seat lock expired.");
      clearLock({ silent: true }).catch(() => null);
      setLockExpiry(null);
      setSeats((prev) => prev.map((p) => ({ 
        ...p, 
        isSelected: false, 
        status: p.status === "locked" ? "available" : p.status,
        lockedBy: undefined
      })));
    }
  }, [remainingSeconds, lockId, clearLock]);

  /* ---------------------- Zones grouping ---------------------- */
  type ZoneEntry = { seatsFlat: SeatWithSelection[]; rows: Map<string, SeatWithSelection[]> };
  const zonesMap = useMemo(() => {
    const map = new Map<string, ZoneEntry>();
    zoneOrder.forEach((z) => map.set(z, { seatsFlat: [], rows: new Map() }));

    seats.forEach((s) => {
      const rawZone = String((s.zone ?? s.section ?? s.category ?? "")).toLowerCase();
      const mapped = ZONE_MAP[rawZone] ?? rawZone ?? "royal_silver";
      if (!map.has(mapped)) map.set(mapped, { seatsFlat: [], rows: new Map() });
      map.get(mapped)!.seatsFlat.push(s);
    });

    // Sofa fallback logic
    const sofa = map.get("royal_sofa");
    if (sofa && sofa.seatsFlat.length === 0) {
      const gold = map.get("royal_gold");
      if (gold && gold.seatsFlat.length > 0) {
        const rows = new Map<string, SeatWithSelection[]>();
        gold.seatsFlat.forEach((s) => {
          const r = seatRow(s);
          if (!rows.has(r)) rows.set(r, []);
          rows.get(r)!.push(s);
        });
        const largest = Array.from(rows.entries()).sort((a, b) => b[1].length - a[1].length)[0];
        if (largest) {
          const rowSeats = largest[1].slice().sort((a, b) => Number(a.number) - Number(b.number));
          const count = Math.min(6, rowSeats.length);
          const start = Math.floor((rowSeats.length - count) / 2);
          const slice = rowSeats.slice(start, start + count);
          sofa.seatsFlat.push(...slice);
          gold.seatsFlat = gold.seatsFlat.filter((s) => !slice.some((x) => x.id === s.id));
        }
      }
      if (sofa.seatsFlat.length === 0 && seats.length > 0) {
        sofa.seatsFlat.push(...seats.slice(0, Math.min(6, seats.length)));
      }
    }

    if (sofa) {
      sofa.rows = new Map([["S", sofa.seatsFlat.slice().sort((a, b) => Number(a.number) - Number(b.number))]]);
    }

    ["royal_gold", "royal_silver"].forEach((zone) => {
      const entry = map.get(zone);
      if (!entry) return;
      const rowMap = new Map<string, SeatWithSelection[]>();
      entry.seatsFlat.forEach((s) => {
        const r = seatRow(s);
        if (!rowMap.has(r)) rowMap.set(r, []);
        rowMap.get(r)!.push(s);
      });
      entry.rows = rowMap;
    });

    return map;
  }, [seats]);

  /* ---------------------- Movie info ---------------------- */
  const info = useMemo(() => {
    const m: any = (meta as any)?.movie ?? (meta as any) ?? {};
    const theatre = (meta as any)?.theatre ?? (meta as any)?.cinema ?? {};
    const venue = typeof theatre === "string" ? theatre : theatre?.name ?? theatre?.title ?? "Theatre";
    return {
      title: m?.title ?? (meta as any)?.title ?? "Movie",
      genres: Array.isArray(m?.genres) && m.genres.length ? m.genres.join(" • ") : m?.genre ?? "",
      language: m?.language ?? "",
      rating: m?.rating ?? "",
      venue,
      time: meta ? new Date((meta as any)?.start_time ?? (meta as any)?.time ?? Date.now()).toLocaleString() : "",
    };
  }, [meta]);

  /* ---------------------- Theme ---------------------- */
  const theme: React.CSSProperties = {
    ["--bg" as any]: "#0B0E12",
    ["--panel" as any]: "#121418",
    ["--muted" as any]: "#9AA3AD",
    ["--text" as any]: "#E6EEF6",
    ["--accent" as any]: "#F5C518",
    ["--seat-border" as any]: "#2A3036",
    ["--seat-occupied" as any]: "#2A2F34",
    ["--locked-color" as any]: "#5D4A8A",
  };

  if (loading) {
    return (
      <div className="seat-selection-page" style={theme}>
        <div style={{ padding: 40 }}>
          <Loader />
        </div>
      </div>
    );
  }

  if (!!error && seats.length === 0) {
    return (
      <div className="seat-selection-page" style={theme}>
        <div style={{ padding: 24, color: "var(--muted)" }}>
          <strong>Unable to load seating</strong>
          <div style={{ marginTop: 8 }}>{error}</div>
        </div>
      </div>
    );
  }

  /* ---------------------- Render ---------------------- */
  return (
    <div className="seat-selection-page" style={{ padding: 18, background: "var(--bg)", minHeight: "80vh", ...theme }}>
      <div style={{ maxWidth: 1100, margin: "0 auto 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ color: "var(--text)", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Select Seats
          </h2>
          <div style={{ color: "var(--muted)", marginTop: 6 }}>{info.venue} · {info.time}</div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Connection Status */}
          <div style={{ 
            color: connectionStatus === 'CONNECTED' ? '#10B981' : '#EF4444',
            background: "rgba(255,255,255,0.02)", 
            padding: "6px 12px", 
            borderRadius: 10, 
            fontWeight: 600,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: connectionStatus === 'CONNECTED' ? '#10B981' : '#EF4444'
            }} />
            {connectionStatus === 'CONNECTED' ? 'LIVE' : 'OFFLINE'}
          </div>
          
          {/* Lock Timer */}
          {lockExpiry && (
            <div style={{ color: "var(--text)", background: "rgba(255,255,255,0.02)", padding: "8px 12px", borderRadius: 10, fontWeight: 600 }}>
              Lock expires in {formatTimer()}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        <div>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "80%", height: 44, margin: "0 auto", display: "block" }}>
              <path d="M2,26 C30,2 70,2 98,26" stroke="var(--accent)" strokeWidth={3} fill="none" strokeLinecap="round" />
            </svg>
            <div style={{ color: "var(--muted)", marginTop: 8, letterSpacing: "0.2em", fontWeight: 600 }}>SCREEN</div>

            <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 12 }}>
              <LegendBox color="transparent" label="Available" border />
              <LegendBox color="var(--accent)" label="Selected" />
              <LegendBox color="var(--seat-occupied)" label="Booked" />
              <LegendBox color="var(--locked-color)" label="Locked" />
            </div>
          </div>

          <div style={{ background: "var(--panel)", borderRadius: 12, padding: 20 }}>
            {zoneOrder.map((zone) => {
              const entry = zonesMap.get(zone);
              if (!entry || entry.seatsFlat.length === 0) return null;

              return (
                <div key={zone} style={{ marginBottom: 24 }}>
                  <div style={{ color: "var(--accent)", fontWeight: 600, marginBottom: 12, textAlign: "center" }}>
                    {zoneLabels[zone] ?? zone.toUpperCase()}
                  </div>

                  {zone === "royal_sofa" ? (
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                      {entry.seatsFlat.map((s, idx) => (
                        <button
                          type="button"
                          key={s.id}
                          onClick={(e) => toggleSeat(s, e)}
                          disabled={s.status === "booked" || (s.status === "locked" && s.lockedBy !== currentOwner)}
                          className={`seat ${s.isSelected ? "selected" : ""} ${s.status}`}
                          style={{
                            width: 60,
                            height: 40,
                            borderRadius: 8,
                            border: `2px solid ${
                              s.isSelected ? "var(--accent)" : 
                              s.status === "booked" ? "var(--seat-occupied)" : 
                              s.status === "locked" ? "var(--locked-color)" : "var(--seat-border)"
                            }`,
                            background: s.isSelected ? "var(--accent)" : 
                                      s.status === "booked" ? "var(--seat-occupied)" : 
                                      s.status === "locked" ? "var(--locked-color)" : "transparent",
                            color: s.isSelected ? "#000" : "var(--text)",
                            cursor: s.status === "booked" || (s.status === "locked" && s.lockedBy !== currentOwner) ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {seatDisplayNumber(s, zone, idx)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    Array.from(entry.rows.entries()).map(([rowLabel, rowSeats]) => (
                      <div key={rowLabel} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ color: "var(--muted)", minWidth: 24, textAlign: "center", fontWeight: 600 }}>{rowLabel}</div>
                        {rowSeats.sort((a, b) => Number(a.number) - Number(b.number)).map((s) => (
                          <button
                            type="button"
                            key={s.id}
                            onClick={(e) => toggleSeat(s, e)}
                            disabled={s.status === "booked" || (s.status === "locked" && s.lockedBy !== currentOwner)}
                            className={`seat ${s.isSelected ? "selected" : ""} ${s.status}`}
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 6,
                              border: `2px solid ${
                                s.isSelected ? "var(--accent)" : 
                                s.status === "booked" ? "var(--seat-occupied)" : 
                                s.status === "locked" ? "var(--locked-color)" : "var(--seat-border)"
                              }`,
                              background: s.isSelected ? "var(--accent)" : 
                                        s.status === "booked" ? "var(--seat-occupied)" : 
                                        s.status === "locked" ? "var(--locked-color)" : "transparent",
                              color: s.isSelected ? "#000" : "var(--text)",
                              cursor: s.status === "booked" || (s.status === "locked" && s.lockedBy !== currentOwner) ? "not-allowed" : "pointer",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                            }}
                          >
                            {s.number}
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary Panel */}
        <div style={{ background: "var(--panel)", borderRadius: 12, padding: 20, height: "fit-content" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <PosterImage meta={meta} alt={info.title} style={{ width: 85, height: 120, borderRadius: 12 }} />
            <div style={{ flex: 1 }}>
              <h3 style={{ color: "var(--text)", margin: "0 0 8px 0", fontSize: 18 }}>{info.title}</h3>
              <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 4 }}>{info.genres}</div>
              <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 4 }}>{info.language} • {info.rating}</div>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>{info.venue}</div>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>{info.time}</div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--seat-border)", paddingTop: 16 }}>
            <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: 12 }}>Selected Seats</div>
            
            {selectedSeats.length === 0 ? (
              <div style={{ color: "var(--muted)", fontStyle: "italic", textAlign: "center", padding: 20 }}>
                No seats selected
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  {selectedSeats.map((seat) => (
                    <div key={seat.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ color: "var(--text)" }}>
                        {seat.label} • {zoneLabels[seat.zone!] ?? seat.zone}
                      </div>
                      <div style={{ color: "var(--accent)", fontWeight: 600 }}>₹{seat.price ?? 0}</div>
                    </div>
                  ))}
                </div>
                
                <div style={{ borderTop: "1px solid var(--seat-border)", paddingTop: 12, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: "var(--text)", fontWeight: 600 }}>Total Amount</div>
                    <div style={{ color: "var(--accent)", fontWeight: 600, fontSize: 18 }}>₹{totalAmount}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={proceedToCheckout}
                  disabled={selectedSeats.length === 0 || summaryLoading}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: selectedSeats.length === 0 ? "var(--seat-border)" : "var(--accent)",
                    color: selectedSeats.length === 0 ? "var(--muted)" : "#000",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: selectedSeats.length === 0 ? "not-allowed" : "pointer",
                    fontSize: 16,
                  }}
                >
                  {summaryLoading ? "Processing..." : "Proceed to Checkout"}
                </button>

                {lockExpiry && (
                  <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, marginTop: 12 }}>
                    Seats held for {formatTimer()}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeatSelection;