import { TestBed, fakeAsync, tick, discardPeriodicTasks, flush } from '@angular/core/testing';
import { TransmissionEngineService } from './transmission-engine.service';
import { StateService } from './state.service';
import {
  PostStation,
  StationStatus,
  SignalType,
  TransmissionDirection,
  TransmissionRecord,
  createPostStation,
  TransmissionEvent
} from '../models';
import { first, skip } from 'rxjs/operators';
import { Observable } from 'rxjs';

describe('TransmissionEngineService', () => {
  let engineService: TransmissionEngineService;
  let stateService: StateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StateService, TransmissionEngineService]
    });
    engineService = TestBed.inject(TransmissionEngineService);
    stateService = TestBed.inject(StateService);
    stateService.resetAll();
  });

  afterEach(() => {
    engineService.stop();
  });

  it('应该被创建', () => {
    expect(engineService).toBeTruthy();
  });

  describe('前置检查', () => {
    it('未确认起点信号前不能启动整条链路', () => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);
      stateService.addStation(station2);
      stateService.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [SignalType.DRUM, SignalType.LANTERN, SignalType.FLAG],
        delayMs: 100
      });

      stateService.setStartStationId(station1.id);
      stateService.setStartSignalType(SignalType.DRUM);

      let errorMessage = '';
      engineService.errors$.pipe(first()).subscribe(err => {
        errorMessage = err;
      });

      engineService.startTransmission().subscribe({
        error: (err) => {
          expect(err.message).toContain('未确认起点信号前不能启动整条链路');
        }
      });

      expect(errorMessage).toContain('未确认起点信号前不能启动整条链路');
    });

    it('起点驿铺已中断时不能启动传输', () => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: true
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);
      stateService.addStation(station2);
      stateService.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [SignalType.DRUM],
        delayMs: 100
      });

      stateService.setStartStationId(station1.id);
      stateService.setStartSignalType(SignalType.DRUM);
      stateService.setStartSignalConfirmed(true);

      engineService.startTransmission().subscribe({
        error: (err) => {
          expect(err.message).toContain('起点驿铺已中断');
        }
      });
    });
  });

  describe('通视检查', () => {
    it('不通视的驿铺之间不能直接传讯', fakeAsync(() => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station3 = createPostStation({
        name: '驿C',
        x: 300,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);
      stateService.addStation(station2);
      stateService.addStation(station3);

      stateService.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.FORWARD,
        signalTypes: [SignalType.DRUM],
        delayMs: 100
      });

      stateService.setStartStationId(station1.id);
      stateService.setStartSignalType(SignalType.DRUM);
      stateService.setStartSignalConfirmed(true);

      const events: TransmissionEvent[] = [];
      engineService.transmissionEvents$.subscribe(e => events.push(e));

      engineService.startTransmission().subscribe();
      tick(500);

      const station3Events = events.filter(e => e.toStationId === station3.id);
      expect(station3Events.length).toBe(0);

      const station2Received = events.find(e => e.toStationId === station2.id && e.status === 'received');
      expect(station2Received).toBeDefined();

      discardPeriodicTasks();
    }));

    it('通视关系应该支持方向约束', fakeAsync(() => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);
      stateService.addStation(station2);

      stateService.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.FORWARD,
        signalTypes: [SignalType.DRUM],
        delayMs: 100
      });

      stateService.setStartStationId(station2.id);
      stateService.setStartSignalType(SignalType.DRUM);
      stateService.setStartSignalConfirmed(true);

      engineService.startTransmission().subscribe({
        error: (err) => {
          expect(err.message).toContain('没有可用的传出通视关系');
        }
      });

      discardPeriodicTasks();
    }));
  });

  describe('中断处理', () => {
    it('节点中断后必须阻断后续链路', fakeAsync(() => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station3 = createPostStation({
        name: '驿C',
        x: 300,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);
      stateService.addStation(station2);
      stateService.addStation(station3);

      stateService.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [SignalType.DRUM],
        delayMs: 500
      });
      stateService.addLink({
        fromStationId: station2.id,
        toStationId: station3.id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [SignalType.DRUM],
        delayMs: 100
      });

      stateService.setStartStationId(station1.id);
      stateService.setStartSignalType(SignalType.DRUM);
      stateService.setStartSignalConfirmed(true);

      const events: TransmissionEvent[] = [];
      engineService.transmissionEvents$.subscribe(e => events.push(e));

      engineService.startTransmission().subscribe();
      tick(100);

      engineService.interruptStation(station2.id, '测试中断');
      tick(1000);

      const station3Received = events.find(
        e => e.toStationId === station3.id && e.status === 'received'
      );
      expect(station3Received).toBeUndefined();

      const interruptedEvent = events.find(
        e => e.status === 'interrupted' &&
             (e.toStationId === station2.id || e.fromStationId === station2.id)
      );
      expect(interruptedEvent).toBeDefined();

      discardPeriodicTasks();
    }));
  });

  describe('播放控制', () => {
    it('应该支持暂停和继续', fakeAsync(() => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);
      stateService.addStation(station2);
      stateService.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [SignalType.DRUM],
        delayMs: 500
      });

      stateService.setStartStationId(station1.id);
      stateService.setStartSignalType(SignalType.DRUM);
      stateService.setStartSignalConfirmed(true);

      const events: TransmissionEvent[] = [];
      engineService.transmissionEvents$.subscribe(e => events.push(e));

      engineService.startTransmission().subscribe();
      tick(100);

      engineService.pause();
      tick(1000);

      const beforeResumeCount = events.length;

      engineService.resume();
      tick(1000);

      expect(events.length).toBeGreaterThan(beforeResumeCount);

      discardPeriodicTasks();
    }));

    it('应该支持速度调整', fakeAsync(() => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);
      stateService.addStation(station2);
      stateService.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [SignalType.DRUM],
        delayMs: 1000
      });

      stateService.setStartStationId(station1.id);
      stateService.setStartSignalType(SignalType.DRUM);
      stateService.setStartSignalConfirmed(true);

      engineService.setSpeed(4);

      const events: TransmissionEvent[] = [];
      engineService.transmissionEvents$.subscribe(e => events.push(e));

      engineService.startTransmission().subscribe();
      tick(500);

      const station2Received = events.find(
        e => e.toStationId === station2.id && e.status === 'received'
      );
      expect(station2Received).toBeDefined();

      discardPeriodicTasks();
    }));
  });

  describe('回放功能', () => {
    it('回放应该正确初始化并设置回放模式', fakeAsync(() => {
      const originalEvents: TransmissionEvent[] = [
        {
          eventId: '1',
          timestamp: 100,
          fromStationId: 'station-1',
          toStationId: 'station-1',
          signalType: SignalType.DRUM,
          status: 'sent',
          delayMs: 0
        },
        {
          eventId: '2',
          timestamp: 1100,
          fromStationId: 'station-1',
          toStationId: 'station-2',
          signalType: SignalType.DRUM,
          status: 'received',
          delayMs: 1000
        }
      ];

      const originalRecord: TransmissionRecord = {
        recordId: 'test-record',
        startTime: 100,
        endTime: 1100,
        events: originalEvents,
        startStationId: 'station-1',
        initialSignal: SignalType.DRUM,
        conflicts: [{
          stationId: 'station-1',
          signalType1: SignalType.DRUM,
          signalType2: SignalType.LANTERN,
          timestamp: 500,
          message: '测试冲突'
        }],
        interruptions: [{
          stationId: 'station-2',
          reason: '测试中断',
          timestamp: 800
        }]
      };

      const station1 = createPostStation({
        id: 'station-1',
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        id: 'station-2',
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);
      stateService.addStation(station2);

      let isPlaybackMode = false;
      let totalTime = 0;
      let playbackState: any = null;
      stateService.playbackState$.subscribe(ps => {
        playbackState = ps;
        isPlaybackMode = ps.isPlaybackMode;
        totalTime = ps.totalTime;
      });

      let currentTransmission: TransmissionRecord | null = null as TransmissionRecord | null;
      stateService.currentTransmission$.subscribe((ct: TransmissionRecord | null) => {
        currentTransmission = ct;
      });

      const playbackEvents: TransmissionEvent[] = [];
      engineService.transmissionEvents$.subscribe(e => playbackEvents.push(e));

      engineService.playback(originalRecord).subscribe();

      tick(100);

      expect(isPlaybackMode).toBe(true);
      expect(totalTime).toBe(1000);
      expect(currentTransmission).not.toBeNull();
      expect(currentTransmission?.startStationId).toBe(originalRecord.startStationId);
      expect(currentTransmission?.initialSignal).toBe(originalRecord.initialSignal);

      expect(playbackEvents.length).toBeGreaterThan(0);
      expect(playbackEvents[0].signalType).toBe(originalEvents[0].signalType);
      expect(playbackEvents[0].fromStationId).toBe(originalEvents[0].fromStationId);
      expect(playbackEvents[0].status).toBe(originalEvents[0].status);

      engineService.stop();
      discardPeriodicTasks();
    }));

    it('回放完成后应该保存冲突和中断记录', fakeAsync(() => {
      const originalEvents: TransmissionEvent[] = [
        {
          eventId: '1',
          timestamp: 100,
          fromStationId: 'station-1',
          toStationId: 'station-1',
          signalType: SignalType.DRUM,
          status: 'sent',
          delayMs: 0
        }
      ];

      const testConflict = {
        stationId: 'station-1',
        signalType1: SignalType.DRUM,
        signalType2: SignalType.LANTERN,
        timestamp: 500,
        message: '测试冲突'
      };

      const testInterruption = {
        stationId: 'station-2',
        reason: '测试中断',
        timestamp: 800
      };

      const originalRecord: TransmissionRecord = {
        recordId: 'test-record-2',
        startTime: 100,
        endTime: 100,
        events: originalEvents,
        startStationId: 'station-1',
        initialSignal: SignalType.DRUM,
        conflicts: [testConflict],
        interruptions: [testInterruption]
      };

      const station1 = createPostStation({
        id: 'station-1',
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);

      let history: TransmissionRecord[] = [];
      stateService.transmissionHistory$.subscribe(h => history = h);

      const initialHistoryLength = history.length;

      engineService.playback(originalRecord).subscribe();

      flush();

      const playbackRecord = history.find(h => h.recordId === originalRecord.recordId);
      expect(playbackRecord).toBeDefined();
      expect(playbackRecord?.conflicts.length).toBe(1);
      expect(playbackRecord?.conflicts[0].message).toBe(testConflict.message);
      expect(playbackRecord?.interruptions.length).toBe(1);
      expect(playbackRecord?.interruptions[0].reason).toBe(testInterruption.reason);

      discardPeriodicTasks();
    }));
  });

  describe('信号类型检查', () => {
    it('通视关系不支持的信号类型不能传递', fakeAsync(() => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      stateService.addStation(station1);
      stateService.addStation(station2);

      stateService.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [SignalType.DRUM],
        delayMs: 100
      });

      stateService.setStartStationId(station1.id);
      stateService.setStartSignalType(SignalType.LANTERN);
      stateService.setStartSignalConfirmed(true);

      const events: TransmissionEvent[] = [];
      engineService.transmissionEvents$.subscribe(e => events.push(e));

      engineService.startTransmission().subscribe();
      tick(500);

      const station2Received = events.find(
        e => e.toStationId === station2.id && e.status === 'received'
      );
      expect(station2Received).toBeUndefined();

      discardPeriodicTasks();
    }));
  });
});
