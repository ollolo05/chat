import { useState, useEffect, useRef, useCallback } from 'react';
import { User, ChatMessage, WebSocketMessage, RegistrationMessage } from '../types';

const WS_URL = 'ws://localhost:8100';

export const useChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);

  // Helper to get current time string HH:MM
  const getCurrentTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Generate or retrieve client ID
  const getClientId = () => {
    let id = localStorage.getItem('clientId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('clientId', id);
    }
    return id;
  };

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as WebSocketMessage;
      
      switch (data.type) {
        case 'message': {
          // The server broadcasts messages from others.
          // We need to display them.
          const newMsg: ChatMessage = {
            id: crypto.randomUUID(),
            type: 'message',
            name: data.name,
            text: (data as any).text, // Type assertion for safety
            timestamp: getCurrentTime(),
            isSelf: false
          };
          setMessages(prev => [newMsg, ...prev]);
          break;
        }
        case 'registration': {
            // New user connected or receiving list of users
            setOnlineUsers(prev => {
                // Avoid duplicates
                if (prev.find(u => u.clientId === data.clientId)) return prev;
                return [...prev, { name: data.name, clientId: data.clientId }];
            });
            break;
        }
        case 'deregistration': {
            setOnlineUsers(prev => prev.filter(u => u.clientId !== data.clientId));
            break;
        }
      }
    } catch (e) {
      console.error("Failed to parse message", e);
    }
  }, []);

  const connect = useCallback((user: User) => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(WS_URL);
    
    socket.onopen = () => {
      console.log('Connected to WS');
      setIsConnected(true);
      
      // Send registration immediately
      const regMsg: RegistrationMessage = {
        type: 'registration',
        clientId: user.clientId,
        name: user.name
      };
      socket.send(JSON.stringify(regMsg));
      
      // Clear any reconnect timeout
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
    };

    socket.onmessage = handleMessage;

    socket.onclose = () => {
      console.log('Disconnected');
      setIsConnected(false);
      // Attempt reconnect after 3 seconds
      reconnectTimeout.current = window.setTimeout(() => {
        connect(user);
      }, 3000);
    };

    socket.onerror = (err) => {
        console.error("WS Error", err);
        socket.close();
    };

    ws.current = socket;
  }, [handleMessage]);

  const login = (name: string) => {
    const user: User = {
      name,
      clientId: getClientId()
    };
    setCurrentUser(user);
    connect(user);
  };

  const sendMessage = (text: string) => {
    if (!currentUser || !ws.current) return;

    // Create local message object for immediate display
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      type: 'message',
      name: currentUser.name,
      text,
      timestamp: getCurrentTime(),
      isSelf: true
    };

    setMessages(prev => [msg, ...prev]);

    // Send to server
    if (ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'message',
        name: currentUser.name,
        text
      }));
    } else {
        console.warn("Socket not open, message not sent to server");
    }
  };

  useEffect(() => {
    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current);
      }
    };
  }, []);

  return {
    messages,
    onlineUsers,
    currentUser,
    isConnected,
    sendMessage,
    login
  };
};