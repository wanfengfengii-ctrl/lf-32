import { Injectable } from '@angular/core';
import {
  Observable,
  Subject,
  Subscription,
  timer,
  throwError,
  interval
} from 'rxjs';
import {
  takeUntil
} from 'rxjs/operators';
import {
  StateService
} from './state.service';
import {
  TransmissionEvent,
  TransmissionRecord,
  SignalConflict,
  InterruptionRecord,
  TransmissionDirection,
  SignalType,
  VisibilityLink,
  PostStation,
  StationStatus,
  PlaybackState,
  PlaybackSpeed
} from '../models';

interface BfsQueueItem {
  fromId: string;
  toId: string;
  signalType: SignalType;
  delayMs: number;
  linkId: string;
}

interface PendingTimer {
  subscription: Subscription;
  remainingMs: number;
  startTime: number;
  queueItem: BfsQueueItem;
}

interface PreCheckResult {
  valid: boolean;
  message: string;
}

interface ConflictCheckResult {
  hasConflict: boolean;
  conflict?: SignalConflict;
}

@Injectable({ providedIn: 'root' })
export class TransmissionEngineService {
  private readonly transmissionEvent$ = new Subject<TransmissionEvent>();
  private readonly conflict$ = new Subject<SignalConflict>();
  private readonly interruption$ = new Subject<InterruptionRecord>();
  private readonly error$ = new Subject<string>();
  private readonly stop$ = new Subject<void>();

  private currentRecord: TransmissionRecord | null = null;
  private bfsQueue: BfsQueueItem[] = [];
  private visitedStations = new Set<string>();
  private adjacencyMap = new Map<string, { toId: string; link: VisibilityLink }[]>();
  private pendingTimers: PendingTimer[] = [];
  private isPaused = false;
  private currentSignalType: SignalType | null = null;
  private stationTransmissionTimestamps = new Map<string, Map<SignalType, number>>();
  private readonly CONFLICT_WINDOW_MS = 500;
  private transmissionStartTime = 0;
  private estimatedTotalTime = 0;
  private stationMaxDelay = new Map<string, number>();
  private progressTimer: Subscription | null = null;

  constructor(private readonly stateService: StateService) {}

  get transmissionEvents$(): Observable<TransmissionEvent> {
    return this.transmissionEvent$.asObservable();
  }

  get conflicts$(): Observable<SignalConflict> {
    return this.conflict$.asObservable();
  }

  get interruptions$(): Observable<InterruptionRecord> {
    return this.interruption$.asObservable();
  }

  get errors$(): Observable<string> {
    return this.error$.asObservable();
  }

  private getStartStationId(): string | null {
    return (this.stateService as unknown as { startStationIdSubject: { value: string | null } })
      .startStationIdSubject.value;
  }

  private getStartSignalType(): SignalType | null {
    return (this.stateService as unknown as { startSignalTypeSubject: { value: SignalType | null } })
      .startSignalTypeSubject.value;
  }

  private getStartSignalConfirmed(): boolean {
    return (this.stateService as unknown as { startSignalConfirmedSubject: { value: boolean } })
      .startSignalConfirmedSubject.value;
  }

  private getStations(): PostStation[] {
    return (this.stateService as unknown as { stationsSubject: { value: PostStation[] } })
      .stationsSubject.value;
  }

  private getVisibilityLinks(): VisibilityLink[] {
    return (this.stateService as unknown as { visibilityLinksSubject: { value: VisibilityLink[] } })
      .visibilityLinksSubject.value;
  }

  private getPlaybackSpeed(): PlaybackSpeed {
    return (this.stateService as unknown as { playbackStateSubject: { value: PlaybackState } })
      .playbackStateSubject.value.speed;
  }

  private getCurrentTime(): number {
    return (this.stateService as unknown as { playbackStateSubject: { value: PlaybackState } })
      .playbackStateSubject.value.currentTime;
  }

  startTransmission(): Observable<TransmissionEvent> {
    const preCheckResult = this.runPreChecks();
    if (!preCheckResult.valid) {
      this.error$.next(preCheckResult.message);
      return throwError(() => new Error(preCheckResult.message));
    }

    const startStationId = this.getStartStationId();
    const startSignalType = this.getStartSignalType();
    const stations = this.getStations();
    const links = this.getVisibilityLinks();

    if (!startStationId || !startSignalType) {
      this.error$.next('起点配置不完整');
      return throwError(() => new Error('起点配置不完整'));
    }

    this.resetInternalState();
    this.currentSignalType = startSignalType;
    this.buildAdjacencyMap(links);

    this.transmissionStartTime = Date.now();
    this.stationMaxDelay.set(startStationId, 0);
    this.estimatedTotalTime = this.estimateTotalTime(startStationId, links, stations);

    this.currentRecord = this.createTransmissionRecord(startStationId, startSignalType);
    this.stateService.setCurrentTransmission(this.currentRecord);
    this.stateService.setTotalTime(this.estimatedTotalTime);
    this.stateService.setCurrentTime(0);
    this.stateService.setPlaying();

    this.updateStationStatus(startStationId, StationStatus.TRANSMITTING, startSignalType);
    this.visitedStations.add(startStationId);
    this.recordStationTransmission(startStationId, startSignalType, Date.now());

    const startEvent: TransmissionEvent = {
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      fromStationId: startStationId,
      toStationId: startStationId,
      signalType: startSignalType,
      status: 'sent',
      delayMs: 0
    };
    this.currentRecord.events.push(startEvent);
    this.transmissionEvent$.next(startEvent);

    this.enqueueNeighbors(startStationId, startSignalType);
    this.processQueue();
    this.startProgressTimer();

    return this.transmissionEvent$.asObservable().pipe(
      takeUntil(this.stop$)
    );
  }

  pause(): void {
    if (!this.currentRecord || this.isPaused) {
      return;
    }

    this.isPaused = true;
    this.stateService.setPaused();

    const now = Date.now();
    const speed = this.getPlaybackSpeed();
    for (const timerItem of this.pendingTimers) {
      const elapsed = now - timerItem.startTime;
      const elapsedOriginal = elapsed * speed;
      timerItem.remainingMs = Math.max(0, timerItem.remainingMs - elapsedOriginal);
      timerItem.subscription.unsubscribe();
    }
  }

  resume(): void {
    if (!this.currentRecord || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    this.stateService.setPlaying();

    const speed = this.getPlaybackSpeed();
    for (const timerItem of this.pendingTimers) {
      const actualDelay = timerItem.remainingMs / speed;
      timerItem.startTime = Date.now();
      timerItem.subscription = timer(actualDelay).subscribe(() => {
        this.removePendingTimer(timerItem);
        if (!this.isPaused) {
          this.processQueueItem(timerItem.queueItem);
          this.processQueue();
        }
      });
    }
  }

  stop(): void {
    this.stopProgressTimer();
    this.stop$.next();

    for (const timerItem of this.pendingTimers) {
      timerItem.subscription.unsubscribe();
    }

    if (this.currentRecord) {
      this.currentRecord.endTime = Date.now();
      const actualTotalTime = this.getCurrentTime();
      if (actualTotalTime > 0) {
        this.stateService.setTotalTime(actualTotalTime);
      }
      this.stateService.addToTransmissionHistory({ ...this.currentRecord });
      this.stateService.setCurrentTransmission(null);
    }

    this.stateService.resetPlaybackState();
    this.resetInternalState();
  }

  playback(record: TransmissionRecord): Observable<TransmissionEvent> {
    if (record.events.length === 0) {
      this.error$.next('回放记录为空');
      return throwError(() => new Error('回放记录为空'));
    }

    this.resetInternalState();
    this.currentRecord = {
      ...record,
      events: [],
      startTime: Date.now(),
      conflicts: [],
      interruptions: []
    };
    this.stateService.setCurrentTransmission(this.currentRecord);
    this.stateService.setPlaying();
    this.stateService.togglePlaybackMode();

    const sortedEvents = [...record.events].sort((a, b) => a.timestamp - b.timestamp);
    const baseTimestamp = sortedEvents[0].timestamp;
    const totalTime = sortedEvents[sortedEvents.length - 1].timestamp - baseTimestamp;
    this.stateService.setTotalTime(totalTime);
    this.stateService.setCurrentTime(0);

    this.playbackEvents(sortedEvents, baseTimestamp, record);

    return this.transmissionEvent$.asObservable().pipe(
      takeUntil(this.stop$)
    );
  }

  setSpeed(speed: PlaybackSpeed): void {
    const oldSpeed = this.getPlaybackSpeed();
    if (oldSpeed === speed) {
      this.stateService.setSpeed(speed);
      return;
    }
    this.stateService.setSpeed(speed);

    if (!this.currentRecord || this.isPaused) {
      return;
    }

    const now = Date.now();
    for (const timerItem of this.pendingTimers) {
      const elapsed = now - timerItem.startTime;
      const elapsedOriginal = elapsed * oldSpeed;
      timerItem.remainingMs = Math.max(0, timerItem.remainingMs - elapsedOriginal);
      timerItem.subscription.unsubscribe();

      const actualDelay = timerItem.remainingMs / speed;
      timerItem.startTime = Date.now();
      timerItem.subscription = timer(actualDelay).subscribe(() => {
        this.removePendingTimer(timerItem);
        if (!this.isPaused) {
          this.processQueueItem(timerItem.queueItem);
          this.processQueue();
        }
      });
    }
  }

  interruptStation(stationId: string, reason: string): void {
    const stations = this.getStations();
    const station = stations.find((s: PostStation) => s.id === stationId);
    if (!station) {
      return;
    }

    const interruption: InterruptionRecord = {
      stationId,
      reason,
      timestamp: Date.now()
    };

    this.interruption$.next(interruption);
    this.stateService.addInterruption(interruption);

    if (this.currentRecord) {
      this.currentRecord.interruptions.push(interruption);

      const affectedTimers = this.pendingTimers.filter(
        t => t.queueItem.fromId === stationId || t.queueItem.toId === stationId
      );

      for (const timerItem of affectedTimers) {
        const interruptedEvent: TransmissionEvent = {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          fromStationId: timerItem.queueItem.fromId,
          toStationId: timerItem.queueItem.toId,
          signalType: timerItem.queueItem.signalType,
          status: 'interrupted',
          delayMs: timerItem.queueItem.delayMs,
          errorMessage: `驿铺「${station.name}」中断：${reason}`
        };
        this.currentRecord.events.push(interruptedEvent);
        this.transmissionEvent$.next(interruptedEvent);
      }
    }

    this.updateStationStatus(stationId, StationStatus.INTERRUPTED, undefined);
    this.stateService.updateStation(stationId, {
      interrupted: true,
      interruptionReason: reason
    });

    this.removePendingTimersForStation(stationId);
    this.bfsQueue = this.bfsQueue.filter(
      item => item.fromId !== stationId && item.toId !== stationId
    );
  }

  private playbackEvents(sortedEvents: TransmissionEvent[], baseTimestamp: number, originalRecord: TransmissionRecord): void {
    const speed = this.getPlaybackSpeed();
    let eventIndex = 0;

    const processImmediateEvents = () => {
      while (eventIndex < sortedEvents.length && !this.stop$.observed) {
        const event = sortedEvents[eventIndex];
        const currentTime = this.getCurrentTime();
        const eventRelativeTime = event.timestamp - baseTimestamp;

        if (eventRelativeTime <= currentTime) {
          this.processPlaybackEvent(event, baseTimestamp);
          eventIndex++;
        } else {
          break;
        }
      }

      if (eventIndex >= sortedEvents.length || this.stop$.observed) {
        if (eventIndex >= sortedEvents.length && this.currentRecord) {
          this.currentRecord.endTime = Date.now();
          this.currentRecord.conflicts = [...originalRecord.conflicts];
          this.currentRecord.interruptions = [...originalRecord.interruptions];
          this.stateService.addToTransmissionHistory({ ...this.currentRecord });
          this.stateService.setCurrentTransmission(null);
          this.stateService.resetPlaybackState();
        }
        return;
      }

      if (this.isPaused) {
        return;
      }

      const event = sortedEvents[eventIndex];
      const currentTime = this.getCurrentTime();
      const eventRelativeTime = event.timestamp - baseTimestamp;
      const delayMs = (eventRelativeTime - currentTime) / speed;
      this.stateService.setCurrentTime(eventRelativeTime);

      const subscription = timer(delayMs).subscribe(() => {
        this.processPlaybackEvent(event, baseTimestamp);
        eventIndex++;
        processImmediateEvents();
      });

      this.pendingTimers.push({
        subscription,
        remainingMs: delayMs,
        startTime: Date.now(),
        queueItem: {
          fromId: event.fromStationId,
          toId: event.toStationId,
          signalType: event.signalType,
          delayMs: event.delayMs,
          linkId: ''
        }
      });
    };

    processImmediateEvents();
  }

  private processPlaybackEvent(event: TransmissionEvent, baseTimestamp: number): void {
    this.transmissionEvent$.next(event);

    if (this.currentRecord) {
      this.currentRecord.events.push(event);
    }

    if (event.status === 'received') {
      this.updateStationStatus(event.toStationId, StationStatus.CONFIRMED, event.signalType);
    } else if (event.status === 'interrupted') {
      this.updateStationStatus(event.toStationId, StationStatus.INTERRUPTED, undefined);
    } else if (event.status === 'sent') {
      this.updateStationStatus(event.fromStationId, StationStatus.TRANSMITTING, event.signalType);
    }

    this.stateService.setCurrentTime(event.timestamp - baseTimestamp);
  }

  private runPreChecks(): PreCheckResult {
    const startSignalConfirmed = this.getStartSignalConfirmed();
    if (!startSignalConfirmed) {
      return { valid: false, message: '未确认起点信号前不能启动整条链路' };
    }

    const startStationId = this.getStartStationId();
    const startSignalType = this.getStartSignalType();
    const stations = this.getStations();
    const links = this.getVisibilityLinks();

    if (!startStationId) {
      return { valid: false, message: '请选择起点驿铺' };
    }

    if (!startSignalType) {
      return { valid: false, message: '请选择起点信号类型' };
    }

    const startStation = stations.find((s: PostStation) => s.id === startStationId);
    if (!startStation) {
      return { valid: false, message: '起点驿铺不存在' };
    }

    if (startStation.interrupted) {
      return { valid: false, message: '起点驿铺已中断，无法启动传输' };
    }

    const hasOutgoingLinks = links.some(
      (l: VisibilityLink) =>
        (l.fromStationId === startStationId &&
          (l.direction === TransmissionDirection.FORWARD ||
            l.direction === TransmissionDirection.BIDIRECTIONAL)) ||
        (l.toStationId === startStationId &&
          l.direction === TransmissionDirection.BACKWARD)
    );

    if (!hasOutgoingLinks) {
      return { valid: false, message: '起点驿铺没有可用的传出通视关系' };
    }

    return { valid: true, message: '' };
  }

  private resetInternalState(): void {
    this.currentRecord = null;
    this.bfsQueue = [];
    this.visitedStations.clear();
    this.adjacencyMap.clear();
    this.pendingTimers = [];
    this.isPaused = false;
    this.currentSignalType = null;
    this.stationTransmissionTimestamps.clear();
    this.stateService.clearConflicts();
    this.stateService.clearInterruptions();

    const stations = this.getStations();
    for (const station of stations) {
      if (!station.interrupted) {
        this.updateStationStatus(station.id, StationStatus.IDLE, undefined);
      }
    }
  }

  private estimateTotalTime(startStationId: string, links: VisibilityLink[], stations: PostStation[]): number {
    const tempAdjMap = new Map<string, { toId: string; delay: number; signalTypes: SignalType[] }[]>();

    for (const link of links) {
      if (link.direction === TransmissionDirection.FORWARD ||
          link.direction === TransmissionDirection.BIDIRECTIONAL) {
        if (!tempAdjMap.has(link.fromStationId)) {
          tempAdjMap.set(link.fromStationId, []);
        }
        tempAdjMap.get(link.fromStationId)!.push({
          toId: link.toStationId,
          delay: link.delayMs,
          signalTypes: link.signalTypes
        });
      }

      if (link.direction === TransmissionDirection.BACKWARD ||
          link.direction === TransmissionDirection.BIDIRECTIONAL) {
        if (!tempAdjMap.has(link.toStationId)) {
          tempAdjMap.set(link.toStationId, []);
        }
        tempAdjMap.get(link.toStationId)!.push({
          toId: link.fromStationId,
          delay: link.delayMs,
          signalTypes: link.signalTypes
        });
      }
    }

    const maxDelay = new Map<string, number>();
    maxDelay.set(startStationId, 0);
    const visited = new Set<string>([startStationId]);
    const queue: string[] = [startStationId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDelay = maxDelay.get(current) ?? 0;
      const neighbors = tempAdjMap.get(current);
      if (!neighbors) continue;

      for (const { toId, delay } of neighbors) {
        if (!visited.has(toId)) {
          visited.add(toId);
          maxDelay.set(toId, currentDelay + delay);
          queue.push(toId);
        }
      }
    }

    let total = 0;
    for (const d of maxDelay.values()) {
      if (d > total) total = d;
    }
    return total || 1000;
  }

  private buildAdjacencyMap(links: VisibilityLink[]): void {
    this.adjacencyMap.clear();

    for (const link of links) {
      if (link.direction === TransmissionDirection.FORWARD ||
          link.direction === TransmissionDirection.BIDIRECTIONAL) {
        if (!this.adjacencyMap.has(link.fromStationId)) {
          this.adjacencyMap.set(link.fromStationId, []);
        }
        this.adjacencyMap.get(link.fromStationId)!.push({
          toId: link.toStationId,
          link
        });
      }

      if (link.direction === TransmissionDirection.BACKWARD ||
          link.direction === TransmissionDirection.BIDIRECTIONAL) {
        if (!this.adjacencyMap.has(link.toStationId)) {
          this.adjacencyMap.set(link.toStationId, []);
        }
        this.adjacencyMap.get(link.toStationId)!.push({
          toId: link.fromStationId,
          link: {
            ...link,
            fromStationId: link.toStationId,
            toStationId: link.fromStationId
          }
        });
      }
    }
  }

  private createTransmissionRecord(startStationId: string, initialSignal: SignalType): TransmissionRecord {
    return {
      recordId: crypto.randomUUID(),
      startTime: Date.now(),
      events: [],
      startStationId,
      initialSignal,
      conflicts: [],
      interruptions: []
    };
  }

  private updateStationStatus(stationId: string, status: StationStatus, signalType?: SignalType): void {
    this.stateService.updateStation(stationId, {
      status,
      currentSignal: signalType
    });
  }

  private recordStationTransmission(stationId: string, signalType: SignalType, timestamp: number): void {
    if (!this.stationTransmissionTimestamps.has(stationId)) {
      this.stationTransmissionTimestamps.set(stationId, new Map());
    }
    this.stationTransmissionTimestamps.get(stationId)!.set(signalType, timestamp);
  }

  private checkForConflict(stationId: string, newSignalType: SignalType, timestamp: number): ConflictCheckResult {
    const stationTimestamps = this.stationTransmissionTimestamps.get(stationId);
    if (!stationTimestamps) {
      return { hasConflict: false };
    }

    for (const [existingSignalType, existingTimestamp] of stationTimestamps.entries()) {
      if (existingSignalType !== newSignalType) {
        const timeDiff = Math.abs(timestamp - existingTimestamp);
        if (timeDiff < this.CONFLICT_WINDOW_MS) {
          const stations = this.getStations();
          const station = stations.find((s: PostStation) => s.id === stationId);
          const conflict: SignalConflict = {
            stationId,
            signalType1: existingSignalType,
            signalType2: newSignalType,
            timestamp,
            message: `驿铺「${station?.name ?? stationId}」在 ${timeDiff}ms 内尝试发送冲突信号：${existingSignalType} 和 ${newSignalType}`
          };
          return { hasConflict: true, conflict };
        }
      }
    }

    return { hasConflict: false };
  }

  private enqueueNeighbors(stationId: string, signalType: SignalType): void {
    const neighbors = this.adjacencyMap.get(stationId);
    if (!neighbors) return;

    const fromDelay = this.stationMaxDelay.get(stationId) ?? 0;

    for (const { toId, link } of neighbors) {
      if (this.visitedStations.has(toId)) continue;

      const toStation = this.getStations().find((s: PostStation) => s.id === toId);
      if (toStation?.interrupted) continue;

      if (!link.signalTypes.includes(signalType)) continue;

      const toDelay = fromDelay + link.delayMs;
      const existingToDelay = this.stationMaxDelay.get(toId) ?? 0;
      if (toDelay > existingToDelay) {
        this.stationMaxDelay.set(toId, toDelay);
      }
      if (toDelay > this.estimatedTotalTime) {
        this.estimatedTotalTime = toDelay;
        this.stateService.setTotalTime(toDelay);
      }

      this.bfsQueue.push({
        fromId: stationId,
        toId,
        signalType,
        delayMs: link.delayMs,
        linkId: link.id
      });
    }
  }

  private processQueue(): void {
    if (this.isPaused || this.bfsQueue.length === 0) {
      if (this.bfsQueue.length === 0 && this.pendingTimers.length === 0 && this.currentRecord) {
        setTimeout(() => {
          if (this.pendingTimers.length === 0) {
            this.stop();
          }
        }, 100);
      }
      return;
    }

    const speed = this.getPlaybackSpeed();
    const queueItem = this.bfsQueue.shift()!;

    const conflictCheck = this.checkForConflict(
      queueItem.fromId,
      queueItem.signalType,
      Date.now()
    );

    if (conflictCheck.hasConflict && conflictCheck.conflict) {
      this.handleConflict(conflictCheck.conflict);
      return;
    }

    this.recordStationTransmission(queueItem.fromId, queueItem.signalType, Date.now());

    const actualDelay = queueItem.delayMs / speed;
    const timerItem: PendingTimer = {
      subscription: timer(actualDelay).subscribe(() => {
        this.removePendingTimer(timerItem);
        if (!this.isPaused) {
          this.processQueueItem(queueItem);
          this.processQueue();
        }
      }),
      remainingMs: queueItem.delayMs,
      startTime: Date.now(),
      queueItem
    };

    this.pendingTimers.push(timerItem);
  }

  private processQueueItem(item: BfsQueueItem): void {
    const stations = this.getStations();
    const fromStation = stations.find((s: PostStation) => s.id === item.fromId);
    const toStation = stations.find((s: PostStation) => s.id === item.toId);

    if (!fromStation || !toStation) return;

    if (fromStation.interrupted || toStation.interrupted) {
      const interruptedEvent: TransmissionEvent = {
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        fromStationId: item.fromId,
        toStationId: item.toId,
        signalType: item.signalType,
        status: 'interrupted',
        delayMs: item.delayMs,
        errorMessage: '链路中断'
      };
      this.currentRecord?.events.push(interruptedEvent);
      this.transmissionEvent$.next(interruptedEvent);
      return;
    }

    const conflictCheck = this.checkForConflict(
      item.toId,
      item.signalType,
      Date.now()
    );

    if (conflictCheck.hasConflict && conflictCheck.conflict) {
      this.handleConflict(conflictCheck.conflict);
      return;
    }

    const receivedEvent: TransmissionEvent = {
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      fromStationId: item.fromId,
      toStationId: item.toId,
      signalType: item.signalType,
      status: 'received',
      delayMs: item.delayMs
    };

    this.currentRecord?.events.push(receivedEvent);
    this.transmissionEvent$.next(receivedEvent);

    this.updateStationStatus(item.toId, StationStatus.CONFIRMED, item.signalType);
    this.visitedStations.add(item.toId);
    this.recordStationTransmission(item.toId, item.signalType, Date.now());

    this.enqueueNeighbors(item.toId, item.signalType);
  }

  private handleConflict(conflict: SignalConflict): void {
    this.conflict$.next(conflict);
    this.stateService.addConflict(conflict);

    if (this.currentRecord) {
      this.currentRecord.conflicts.push(conflict);
    }

    this.pause();
    this.error$.next(`信号冲突：${conflict.message}`);
  }

  private removePendingTimer(timerItem: PendingTimer): void {
    const index = this.pendingTimers.indexOf(timerItem);
    if (index >= 0) {
      this.pendingTimers.splice(index, 1);
    }
  }

  private removePendingTimersForStation(stationId: string): void {
    const toRemove = this.pendingTimers.filter(
      t => t.queueItem.fromId === stationId || t.queueItem.toId === stationId
    );
    for (const t of toRemove) {
      t.subscription.unsubscribe();
      this.removePendingTimer(t);
    }
  }

  private startProgressTimer(): void {
    this.stopProgressTimer();

    const updateInterval = 50;
    this.progressTimer = interval(updateInterval).pipe(
      takeUntil(this.stop$)
    ).subscribe(() => {
      if (this.isPaused || !this.currentRecord) {
        return;
      }

      const speed = this.getPlaybackSpeed();
      const currentTime = this.getCurrentTime();
      const newTime = currentTime + updateInterval * speed;

      const maxTime = this.computeActualMaxTime();
      this.stateService.setCurrentTime(Math.min(newTime, maxTime));
    });
  }

  private stopProgressTimer(): void {
    if (this.progressTimer) {
      this.progressTimer.unsubscribe();
      this.progressTimer = null;
    }
  }

  private computeActualMaxTime(): number {
    let maxTime = this.estimatedTotalTime;
    for (const timerItem of this.pendingTimers) {
      const speed = this.getPlaybackSpeed();
      const elapsed = Date.now() - timerItem.startTime;
      const elapsedOriginal = elapsed * speed;
      const remainingOriginal = Math.max(0, timerItem.remainingMs - elapsedOriginal);
      const projectedTime = this.getCurrentTime() + remainingOriginal;
      if (projectedTime > maxTime) {
        maxTime = projectedTime;
      }
    }
    return maxTime;
  }
}
