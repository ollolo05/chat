export interface User {
  clientId: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  type: 'message';
  name: string;
  text: string;
  timestamp: string;
  isSelf: boolean;
}

export interface RegistrationMessage {
  type: 'registration';
  name: string;
  clientId: string;
}

export interface DeregistrationMessage {
  type: 'deregistration';
  clientId: string;
}

export type WebSocketMessage = 
  | (Omit<ChatMessage, 'id' | 'timestamp' | 'isSelf'> & { type: 'message' })
  | RegistrationMessage 
  | DeregistrationMessage;
