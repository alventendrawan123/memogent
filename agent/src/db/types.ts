export type WalletLink = {
  wallet_address: string;
  chat_id: number;
  linked_at: number;
  last_seen_at: number;
};

export type LinkToken = {
  token: string;
  wallet_address: string;
  nonce: string;
  expires_at: number;
  inviter_wallet: string | null;
};

export type Checkin = {
  id: number;
  wallet_address: string;
  sent_at: number;
  responded_at: number | null;
  response: 'alive' | 'busy' | null;
};

export type BlockedChat = {
  chat_id: number;
  blocked_at: number;
};

export type TrackedWill = {
  owner_address: string;
  beneficiary: string;
  registered_at_ms: number;
  inactive_period_sec: number;
  deadline_ms: number;
  last_assessed_at_ms: number | null;
  last_classification: string | null;
  active: boolean;
};

export type Database = {
  public: {
    Tables: {
      wallet_link: {
        Row: WalletLink;
        Insert: WalletLink;
        Update: Partial<WalletLink>;
        Relationships: [];
      };
      link_token: {
        Row: LinkToken;
        Insert: LinkToken;
        Update: Partial<LinkToken>;
        Relationships: [];
      };
      checkin: {
        Row: Checkin;
        Insert: Omit<Checkin, 'id'>;
        Update: Partial<Checkin>;
        Relationships: [];
      };
      blocked_chat: {
        Row: BlockedChat;
        Insert: BlockedChat;
        Update: Partial<BlockedChat>;
        Relationships: [];
      };
      tracked_will: {
        Row: TrackedWill;
        Insert: TrackedWill;
        Update: Partial<TrackedWill>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
