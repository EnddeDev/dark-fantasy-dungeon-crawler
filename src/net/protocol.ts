import type { DuelState } from "../game/duel";
import type { GearItem, Player } from "../game/types";

export interface OnlineProfile {
  id: string;
  login: string;
  name: string;
  level: number;
  gold: number;
  bestFloor: number;
  unlockedFloor: number;
  online: boolean;
  kills: number;
  /** Версия портрета (время загрузки) или null, если портрета нет. */
  portrait?: number | null;
  player?: Player;
}

/** Отношение к игроку: друг, входящая или исходящая заявка, либо ничего. */
export type RequestState = "friend" | "incoming" | "outgoing" | "none";

export interface PlayerSummary {
  id: string;
  login: string;
  name: string;
  level: number;
  bestFloor: number;
  online: boolean;
  friend: boolean;
  requestState: RequestState;
  kills: number;
  portrait: number | null;
}

export interface FriendRequestView {
  requestId: string;
  player: PlayerSummary;
}

/**
 * Неопознанный предмет у другого игрока: только то, что владелец видит без исследования.
 * Редкость, характеристики и значения эффектов скрыты.
 */
export interface HiddenGear {
  uid: string;
  baseId: string;
  slot: GearItem["slot"];
  name: string;
  level: number;
  /** Подпись класса и вида, уже собранная сервером («Среднее · клинок»). */
  classLabel: string;
  wear: GearItem["wear"];
  /** Первый эффект аксессуара без значения, как у владельца до исследования. */
  peek: { name: string; detail: string } | null;
}

/** Предмет в профиле: опознанный — целиком, неопознанный — `HiddenGear`. */
export type ProfileGear = { identified: true; item: GearItem } | { identified: false; item: HiddenGear };

/** Профиль для просмотра: без золота, сундука, сумки, архетипа и рекорда. */
export interface PlayerProfileView {
  id: string;
  name: string;
  level: number;
  online: boolean;
  stats: { str: number; agi: number; int: number };
  portrait: number | null;
  equip: Record<string, ProfileGear | null>;
  friend: boolean;
  requestState: RequestState;
}

export type NotificationKind = "dm" | "friend_request" | "friend_accepted" | "trade" | "duel" | "market_sale";

export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  refId: string | null;
  body: string;
  createdAt: number;
  readAt: number | null;
}

export interface NotificationFeed {
  unread: number;
  byKind: Partial<Record<NotificationKind, number>>;
  items: NotificationItem[];
}

export interface ChatMessage {
  id: number;
  fromId: string;
  fromName: string;
  fromPortrait: number | null;
  body: string;
  createdAt: number;
  channel: string;
}

export interface MarketListing {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerPortrait: number | null;
  /** Предмет лота: опознанный целиком, неопознанный — `HiddenGear` (как в профиле). */
  gear: ProfileGear;
  itemName: string;
  price: number;
  createdAt: number;
  mine: boolean;
}

export type TradeStatus = "offered" | "countered" | "accepted" | "declined" | "cancelled";

export interface TradeOffer {
  id: string;
  fromId: string;
  fromName: string;
  fromPortrait: number | null;
  toId: string;
  toName: string;
  toPortrait: number | null;
  status: TradeStatus;
  offer: GearItem[];
  request: GearItem[];
  message: string;
  createdAt: number;
  updatedAt: number;
}

export type DuelStatus = "pending" | "active" | "finished" | "declined" | "cancelled";

export interface DuelSummary {
  id: string;
  challengerId: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
  challengerPortrait: number | null;
  opponentPortrait: number | null;
  status: DuelStatus;
  winner: string | null;
  yourSide: "a" | "b";
  turn: string;
  round: number;
  deadline: number;
  createdAt: number;
  updatedAt: number;
}

export interface DuelDetail extends DuelSummary {
  state: DuelState;
}
