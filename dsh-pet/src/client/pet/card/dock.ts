/**
 * 贴边探头：把小狗拖到屏幕边缘附近松手，它就扒在那条边上学「窗框里的狗」——下边扒着窗沿往上瞅、
 * 上边倒挂着露头、左右从门边探出半个脑袋偷看；再点一下或拖走就下来。
 * 位置提交仍走 `setCustomPos`（归一化中心），与其它运动驱动同一出口；不碰动画链内部。
 * @module dsh-pet/src/client/pet/card/dock
 */
import { boxToRatio, clampReachableBox } from '../motion/geometry.ts';
import type { Center } from '../motion/geometry.ts';
import type { CardMotion } from './motion.ts';
import type { CardStateApi } from './state.ts';
import type { RuntimePet } from '../types.ts';
import type * as ReactNS from 'react';

/** 四条边。 */
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';

/** 各边贴边后的动作：上下用「扒着窗沿」的专门素材；左右没有专门素材时退回待机，
 *  只露出半边身子，读起来就是「从门边探出半个脑袋」。
 *  注意素材名说的是「从哪条边探头」，所以左右是交叉的：贴左边用「探头往右」那支。 */
const EDGE_ANIM: Record<DockEdge, string> = {
  bottom: '探头往下',
  left: '探头往右',
  right: '探头往左',
  top: '探头往上',
};

/** 松手时离边缘多近就贴上（px）。 */
/** 贴边后留在屏幕内的量（px）。上下边按盒高（size×9/16≈107px）的八成留，
 *  脑袋大小跟平时差不多；左右边留得多一些，否则只剩半张脸。 */
const VISIBLE_V = 64;
const VISIBLE_H = 96;

/** 某条边露在屏幕内的像素。 */
const visiblePx = (edge: DockEdge): number => (edge === 'left' || edge === 'right' ? VISIBLE_H : VISIBLE_V);

/** 注入的 react 能力。 */
export interface DockRuntime {
  /** 副作用；计时器随卡片卸载清掉。 */
  useEffect: (effect: ReactNS.EffectCallback, deps?: ReactNS.DependencyList) => void;
  /** 引用；跨渲染保存收起状态与计时器。 */
  useRef: <T>(initial: T) => ReactNS.MutableRefObject<T>;
}

/** 贴边探头的输入。 */
export interface DockInput {
  /** 卡状态：位置提交。 */
  card: CardStateApi;
  /** 成品配置：取动画池。 */
  cfgRef: ReactNS.MutableRefObject<RuntimePet>;
  /** 装配根迟绑槽：读睡觉状态。 */
  live: ReactNS.MutableRefObject<{ flow?: { sleeping: () => boolean } | undefined }>;
  /** 运动面：读当前盒、停走位、写盒。 */
  motion: CardMotion;
  /** 当帧几何。 */
  metrics: { bottomPad: number; halfH: number; halfW: number; size: number };
  /** 提交归一化中心。 */
  setCustomPos: CardStateApi['actions']['setCustomPos'];
  /** 换动画。 */
  setAnim: (anim: string) => void;
  /** 只播一次。 */
  setOnce: (on: boolean) => void;
}

/** 贴边探头的对外面。 */
export interface Dock {
  /** 松手：离边缘够近就扒上去，否则不动。 */
  settle: () => void;
  /** 从边上下来（点一下、拖一下、菜单都调它）。 */
  wake: () => void;
  /** 当前是否扒在边上。 */
  docked: () => boolean;
}

/**
 * 造贴边探头的 hook。
 *
 * @param rt - 注入的 react 能力。
 * @returns 接收装配输入的 hook。
 */
export function createCardDock(rt: DockRuntime) {
  const { useEffect, useRef } = rt;

  return function useCardDock(input: DockInput): Dock {
    const apiRef = useRef(input);
    apiRef.current = input;
    const armedRef = useRef(true);
    const dockedRef = useRef<{ back: Center; edge: DockEdge } | null>(null);
    const peekTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const peekHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimers = (): void => {
      if (peekTimerRef.current !== null) {
        clearInterval(peekTimerRef.current);
        peekTimerRef.current = null;
      }
      if (peekHoldRef.current !== null) {
        clearTimeout(peekHoldRef.current);
        peekHoldRef.current = null;
      }
    };

    /** 视口与盒尺寸。 */
    const viewport = (): { half: { h: number; w: number }; height: number; width: number } => {
      const { halfH, halfW } = apiRef.current.metrics;
      return { half: { h: halfH, w: halfW }, height: window.innerHeight, width: window.innerWidth };
    };

    /** 「挂在边上」的盒子。 */
    const edgeBox = (edge: DockEdge): { x: number; y: number } => {
      const vp = viewport();
      const cur = apiRef.current.motion.box() ?? { x: 0, y: 0 };
      switch (edge) {
        case 'left':
          return { x: VISIBLE_H - vp.half.w * 2, y: cur.y };
        case 'right':
          return { x: vp.width - VISIBLE_H, y: cur.y };
        case 'top':
          return { x: cur.x, y: VISIBLE_V - vp.half.h * 2 };
        default:
          return { x: cur.x, y: vp.height - VISIBLE_V };
      }
    };

    /** 播放某条边的探头动作（循环，配置里没有就静着）。 */
    const peek = (edge: DockEdge): void => {
      const api = apiRef.current;
      const anim = EDGE_ANIM[edge];
      const pools = api.cfgRef.current.animations as Record<string, unknown>;
      const peekPool = pools.peek;
      const known =
        (Array.isArray(peekPool) && peekPool.includes(anim)) ||
        Object.values(pools).some((pool) => Array.isArray(pool) && pool.includes(anim));
      if (!known) return;
      api.setOnce(false);
      api.setAnim(anim);
      api.card.actions.bumpSeq();
    };

    /** 扒到指定的边上。 */
    const dock = (edge: DockEdge): void => {
      const api = apiRef.current;
      if (dockedRef.current !== null) return;
      if (api.live.current.flow?.sleeping() === true) return;
      const vp = viewport();
      const box = api.motion.box();
      if (box === null) return;
      const back = boxToRatio(box, vp, vp.half);
      const target = clampReachableBox(edgeBox(edge), vp, {
        bottomPad: api.metrics.bottomPad,
        size: api.metrics.size,
      });
      api.motion.flight.stop();
      api.motion.stopMove();
      api.motion.setBox(target);
      api.setCustomPos(boxToRatio(target, vp, vp.half));
      dockedRef.current = { back, edge };
      peek(edge);
    };

    /** 从边上下来，回到扒上去之前的位置。 */
    const wake = (): void => {
      const state = dockedRef.current;
      if (state === null) return;
      clearTimers();
      dockedRef.current = null;
      apiRef.current.setCustomPos(state.back);
    };

    // 卡片卸载时把计时器清干净。
    useEffect(() => () => clearTimers(), []);

    return {
      docked: () => dockedRef.current !== null,
      /**
       * 拖拽途中指针进入边缘带就返回那条边（8px 内），由调用方结束拖拽后调 force()。
       * 用户说得对：贴边该是「拖到屏幕边缘就触发」，不该等到松手。
       */
      hover: (): DockEdge | null => {
        if (dockedRef.current !== null) return null;
        const box = apiRef.current.motion.box();
        if (box === null) return null;
        const { halfH, halfW, size } = apiRef.current.metrics;
        const w = window.innerWidth;
        const h = window.innerHeight;
        // 判定的是「被屏幕边遮住了多少」：过半才算贴边（用户要的是「半只以上被挡住」）。
        const hide: Array<[DockEdge, number]> = [
          ['left', -box.x],
          ['right', box.x + halfW * 2 - w],
          ['top', -box.y],
          ['bottom', box.y + halfH * 2 - h],
        ];
        const [edge, hidden] = hide.reduce((a, b) => (b[1] > a[1] ? b : a));
        // 解绑后要先把它拖出来（遮挡小于三成才重新武装），否则贴边状态下第一帧又被吸回去。
        if (hidden < size * 0.3) armedRef.current = true;
        return armedRef.current && hidden >= size * 0.5 ? edge : null;
      },
      force: (edge: DockEdge) => dock(edge),
      /**
       * 解绑但停在原地（不回到原位）：用户在边上按住要把它拖出来时必须原地起拖，
       * 否则「先跳回原位再跟手」会非常突兀。
       *
       * @returns 贴边前的位置（只是点一下没拖走时用它回去）。
       */
      release: (): Center | null => {
        const state = dockedRef.current;
        clearTimers();
        dockedRef.current = null;
        armedRef.current = false; // 解绑后重新武装，才不会被第一帧立刻吸回去
        return state === null ? null : state.back;
      },
      /** 回到给定位置（点一下边上的宠物时用）。 */
      restore: (back: Center) => apiRef.current.setCustomPos(back),
      settle: () => {
        if (dockedRef.current !== null) return;
        const box = apiRef.current.motion.box();
        if (box === null) return;
        const { halfH, halfW, size } = apiRef.current.metrics;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const hide: Array<[DockEdge, number]> = [
          ['left', -box.x],
          ['right', box.x + halfW * 2 - w],
          ['top', -box.y],
          ['bottom', box.y + halfH * 2 - h],
        ];
        const [edge, hidden] = hide.reduce((a, b) => (b[1] > a[1] ? b : a));
        if (hidden >= size * 0.5) dock(edge);
      },
      wake,
    };
  };
}
