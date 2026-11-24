import React from 'react';
import { User } from '../types';
import { Users, Search } from 'lucide-react';

interface SidebarProps {
  onlineUsers: User[];
  currentUser: User;
}

export const Sidebar: React.FC<SidebarProps> = ({ onlineUsers, currentUser }) => {
  // Filter out self from the list if needed, or show differently.
  // The backend usually sends all clients including self?
  // Based on the provided backend logic: `if (client !== ws ...)` inside `sendRegisteredClients`.
  // So `onlineUsers` likely contains everyone EXCEPT self initially, then updates.
  // We'll trust the hook state.
  
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="px-4 py-3">
        <div className="relative">
            <input 
                type="text" 
                placeholder="Search or start new chat" 
                className="w-full rounded-lg bg-gray-100 py-2 pl-10 pr-4 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pb-2 pt-2">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Users size={14} />
                Online Users ({onlineUsers.length})
            </h3>
            
            <div className="space-y-1">
                {onlineUsers.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                        No other users online.
                    </div>
                ) : (
                    onlineUsers.map((user) => (
                        <div 
                            key={user.clientId} 
                            className="group flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-gray-50"
                        >
                            <div className="relative">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white font-semibold shadow-sm">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500"></span>
                            </div>
                            
                            <div className="flex-1 overflow-hidden">
                                <div className="flex justify-between">
                                    <h4 className="truncate font-medium text-gray-900">{user.name}</h4>
                                    <span className="text-[10px] text-gray-400">Just now</span>
                                </div>
                                <p className="truncate text-xs text-gray-500 group-hover:text-blue-500">
                                    Click to send message
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
      
      <div className="border-t p-4 text-center text-xs text-gray-400">
        Connected to Local Server
      </div>
    </div>
  );
};