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
}

export interface FriendRequestView {
  requestId: string;
  player: PlayerSummary;
}

/** Профиль для просмотра: без золота, сундука, сумки, архетипа и рекорда. */
export interface PlayerProfileView {
  id: string;
  name: string;
  level: number;
  online: boolean;
  stats: { str: number; agi: number; int: number };
  equip: Record<string, { baseId: string; name: string; level: number; rarity: string; identified: boolean; wear: string } | null>;
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
  body: string;
  createdAt: number;
  channel: string;
}

export interface MarketListing {
  id: string;
  sellerId: string;
  sellerName: string;
  item: GearItem;
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
  toId: string;
  toName: string;
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
