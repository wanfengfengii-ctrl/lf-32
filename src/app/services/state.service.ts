import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  PostStation,
  VisibilityLink,
  TransmissionRecord,
  PlaybackState,
  SignalType,
  InterruptionRecord,
  SignalConflict,
  TransmissionDirection,
  StationStatus,
  createPostStation
} from '../models';

@Injectable({ providedIn: 'root' })
export class StateService {
  private readonly stationsSubject = new BehaviorSubject<PostStation[]>([]);
  readonly stations$: Observable<PostStation[]> = this.stationsSubject.asObservable();

  private readonly visibilityLinksSubject = new BehaviorSubject<VisibilityLink[]>([]);
  readonly visibilityLinks$: Observable<VisibilityLink[]> = this.visibilityLinksSubject.asObservable();

  private readonly selectedStationIdSubject = new BehaviorSubject<string | null>(null);
  readonly selectedStationId$: Observable<string | null> = this.selectedStationIdSubject.asObservable();

  private readonly selectedLinkIdSubject = new BehaviorSubject<string | null>(null);
  readonly selectedLinkId$: Observable<string | null> = this.selectedLinkIdSubject.asObservable();

  private readonly currentTransmissionSubject = new BehaviorSubject<TransmissionRecord | null>(null);
  readonly currentTransmission$: Observable<TransmissionRecord | null> = this.currentTransmissionSubject.asObservable();

  private readonly transmissionHistorySubject = new BehaviorSubject<TransmissionRecord[]>([]);
  readonly transmissionHistory$: Observable<TransmissionRecord[]> = this.transmissionHistorySubject.asObservable();

  private readonly playbackStateSubject = new BehaviorSubject<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    speed: 1,
    currentTime: 0,
    totalTime: 0,
    isPlaybackMode: false
  });
  readonly playbackState$: Observable<PlaybackState> = this.playbackStateSubject.asObservable();

  private readonly startSignalConfirmedSubject = new BehaviorSubject<boolean>(false);
  readonly startSignalConfirmed$: Observable<boolean> = this.startSignalConfirmedSubject.asObservable();

  private readonly startStationIdSubject = new BehaviorSubject<string | null>(null);
  readonly startStationId$: Observable<string | null> = this.startStationIdSubject.asObservable();

  private readonly startSignalTypeSubject = new BehaviorSubject<SignalType | null>(null);
  readonly startSignalType$: Observable<SignalType | null> = this.startSignalTypeSubject.asObservable();

  private readonly interruptionsSubject = new BehaviorSubject<InterruptionRecord[]>([]);
  readonly interruptions$: Observable<InterruptionRecord[]> = this.interruptionsSubject.asObservable();

  private readonly conflictsSubject = new BehaviorSubject<SignalConflict[]>([]);
  readonly conflicts$: Observable<SignalConflict[]> = this.conflictsSubject.asObservable();

  private get stations(): PostStation[] {
    return this.stationsSubject.value;
  }

  private get visibilityLinks(): VisibilityLink[] {
    return this.visibilityLinksSubject.value;
  }

  addStation(station: Omit<PostStation, 'id'> & { id?: string }): void {
    const newStation = createPostStation(station);
    this.stationsSubject.next([...this.stations, newStation]);
  }

  updateStation(id: string, updates: Partial<PostStation>): void {
    const updated = this.stations.map(s =>
      s.id === id ? { ...s, ...updates } : s
    );
    this.stationsSubject.next(updated);
  }

  deleteStation(id: string): void {
    const filteredStations = this.stations.filter(s => s.id !== id);
    this.stationsSubject.next(filteredStations);

    const filteredLinks = this.visibilityLinks.filter(
      link => link.fromStationId !== id && link.toStationId !== id
    );
    this.visibilityLinksSubject.next(filteredLinks);

    if (this.selectedStationIdSubject.value === id) {
      this.selectedStationIdSubject.next(null);
    }
    if (this.startStationIdSubject.value === id) {
      this.startStationIdSubject.next(null);
      this.startSignalConfirmedSubject.next(false);
    }
  }

  addLink(link: Omit<VisibilityLink, 'id'> & { id?: string }): void {
    const newLink: VisibilityLink = {
      ...link,
      id: link.id ?? crypto.randomUUID()
    };
    this.visibilityLinksSubject.next([...this.visibilityLinks, newLink]);
  }

  updateLink(id: string, updates: Partial<VisibilityLink>): void {
    const updated = this.visibilityLinks.map(l =>
      l.id === id ? { ...l, ...updates } : l
    );
    this.visibilityLinksSubject.next(updated);
  }

  deleteLink(id: string): void {
    const filtered = this.visibilityLinks.filter(l => l.id !== id);
    this.visibilityLinksSubject.next(filtered);

    if (this.selectedLinkIdSubject.value === id) {
      this.selectedLinkIdSubject.next(null);
    }
  }

  selectStation(id: string | null): void {
    this.selectedStationIdSubject.next(id);
  }

  selectLink(id: string | null): void {
    this.selectedLinkIdSubject.next(id);
  }

  setCurrentTransmission(record: TransmissionRecord | null): void {
    this.currentTransmissionSubject.next(record);
  }

  addToTransmissionHistory(record: TransmissionRecord): void {
    this.transmissionHistorySubject.next([
      ...this.transmissionHistorySubject.value,
      record
    ]);
  }

  setPlaying(): void {
    this.playbackStateSubject.next({
      ...this.playbackStateSubject.value,
      isPlaying: true,
      isPaused: false
    });
  }

  setPaused(): void {
    this.playbackStateSubject.next({
      ...this.playbackStateSubject.value,
      isPlaying: false,
      isPaused: true
    });
  }

  setSpeed(speed: PlaybackState['speed']): void {
    this.playbackStateSubject.next({
      ...this.playbackStateSubject.value,
      speed
    });
  }

  setCurrentTime(time: number): void {
    this.playbackStateSubject.next({
      ...this.playbackStateSubject.value,
      currentTime: time
    });
  }

  setTotalTime(time: number): void {
    this.playbackStateSubject.next({
      ...this.playbackStateSubject.value,
      totalTime: time
    });
  }

  togglePlaybackMode(): void {
    const current = this.playbackStateSubject.value;
    this.playbackStateSubject.next({
      ...current,
      isPlaybackMode: !current.isPlaybackMode,
      isPlaying: false,
      isPaused: false,
      currentTime: 0
    });
  }

  resetPlaybackState(): void {
    this.playbackStateSubject.next({
      isPlaying: false,
      isPaused: false,
      speed: 1,
      currentTime: 0,
      totalTime: 0,
      isPlaybackMode: false
    });
  }

  setStartSignalConfirmed(confirmed: boolean): void {
    this.startSignalConfirmedSubject.next(confirmed);
  }

  setStartStationId(id: string | null): void {
    this.startStationIdSubject.next(id);
    this.startSignalConfirmedSubject.next(false);
  }

  setStartSignalType(type: SignalType | null): void {
    this.startSignalTypeSubject.next(type);
  }

  addInterruption(interruption: InterruptionRecord): void {
    this.interruptionsSubject.next([
      ...this.interruptionsSubject.value,
      interruption
    ]);
  }

  clearInterruptions(): void {
    this.interruptionsSubject.next([]);
  }

  addConflict(conflict: SignalConflict): void {
    this.conflictsSubject.next([
      ...this.conflictsSubject.value,
      conflict
    ]);
  }

  clearConflicts(): void {
    this.conflictsSubject.next([]);
  }

  resetAll(): void {
    this.currentTransmissionSubject.next(null);
    this.transmissionHistorySubject.next([]);
    this.selectedStationIdSubject.next(null);
    this.selectedLinkIdSubject.next(null);
    this.resetPlaybackState();
    this.startSignalConfirmedSubject.next(false);
    this.startStationIdSubject.next(null);
    this.startSignalTypeSubject.next(null);
    this.interruptionsSubject.next([]);
    this.conflictsSubject.next([]);

    const resetStations = this.stations.map(s => ({
      ...s,
      status: StationStatus.IDLE,
      currentSignal: undefined,
      interrupted: false,
      interruptionReason: undefined
    }));
    this.stationsSubject.next(resetStations);
  }

  initDemoData(): void {
    const demoStations: PostStation[] = [
      createPostStation({
        name: '京城驿',
        x: 100,
        y: 250,
        status: StationStatus.IDLE,
        interrupted: false
      }),
      createPostStation({
        name: '潼关驿',
        x: 280,
        y: 250,
        status: StationStatus.IDLE,
        interrupted: false
      }),
      createPostStation({
        name: '新丰驿',
        x: 460,
        y: 250,
        status: StationStatus.IDLE,
        interrupted: false
      }),
      createPostStation({
        name: '灞桥驿',
        x: 640,
        y: 250,
        status: StationStatus.IDLE,
        interrupted: false
      }),
      createPostStation({
        name: '长安驿',
        x: 820,
        y: 250,
        status: StationStatus.IDLE,
        interrupted: false
      })
    ];

    const signalTypes: SignalType[] = [
      SignalType.DRUM,
      SignalType.LANTERN,
      SignalType.FLAG
    ];

    const demoLinks: VisibilityLink[] = [];
    for (let i = 0; i < demoStations.length - 1; i++) {
      demoLinks.push({
        id: crypto.randomUUID(),
        fromStationId: demoStations[i].id,
        toStationId: demoStations[i + 1].id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [...signalTypes],
        delayMs: 1000
      });
    }

    this.stationsSubject.next(demoStations);
    this.visibilityLinksSubject.next(demoLinks);
  }
}
