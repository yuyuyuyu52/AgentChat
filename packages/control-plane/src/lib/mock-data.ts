import { 
  Bot, 
  MessageSquare, 
  ShieldAlert, 
  Terminal, 
  Activity, 
  Key, 
  User, 
  Settings,
  Plus,
  Search,
  MoreVertical,
  RefreshCw,
  ExternalLink,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export interface Agent {
  id: string;
  name: string;
  accountId: string;
  token: string;
  status: 'online' | 'offline' | 'error';
  createdAt: string;
  lastActive: string;
  owner: string;
}

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  isAgent: boolean;
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage: string;
  timestamp: string;
  type: 'private' | 'group';
  unreadCount: number;
  messages?: Message[];
}

export const MOCK_MESSAGES: Record<string, Message[]> = {
  'c1': [
    { id: 'm1', sender: 'user_123', content: 'Hello, I have a question about my order.', timestamp: '2024-04-12T05:10:00Z', isAgent: false },
    { id: 'm2', sender: 'agent_cs_001', content: 'Hello! I can help with that. What is your order number?', timestamp: '2024-04-12T05:11:00Z', isAgent: true },
    { id: 'm3', sender: 'user_123', content: 'It is #ORD-9921.', timestamp: '2024-04-12T05:12:00Z', isAgent: false },
    { id: 'm4', sender: 'agent_cs_001', content: 'Thank you. Checking... Your order has been processed.', timestamp: '2024-04-12T05:15:00Z', isAgent: true },
  ],
  'c2': [
    { id: 'm1', sender: 'admin', content: 'Starting daily sync.', timestamp: '2024-04-12T04:20:00Z', isAgent: false },
    { id: 'm2', sender: 'agent_da_002', content: 'Database connection established.', timestamp: '2024-04-12T04:21:00Z', isAgent: true },
    { id: 'm3', sender: 'agent_cs_001', content: 'Syncing database records...', timestamp: '2024-04-12T04:30:00Z', isAgent: true },
  ]
};

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  status: 'success' | 'failure';
  details: string;
}

export const MOCK_AGENTS: Agent[] = [
  {
    id: '1',
    name: 'Customer Support Bot',
    accountId: 'agent_cs_001',
    token: 'ac_sk_9f2e...4b1a',
    status: 'online',
    createdAt: '2024-03-10T10:00:00Z',
    lastActive: '2024-04-12T05:20:00Z',
    owner: 'will29982@gmail.com'
  },
  {
    id: '2',
    name: 'Data Analyzer',
    accountId: 'agent_da_002',
    token: 'ac_sk_1a8c...7d3e',
    status: 'offline',
    createdAt: '2024-03-15T14:30:00Z',
    lastActive: '2024-04-11T22:15:00Z',
    owner: 'will29982@gmail.com'
  },
  {
    id: '3',
    name: 'Security Monitor',
    accountId: 'agent_sm_003',
    token: 'ac_sk_5e4d...2f9b',
    status: 'online',
    createdAt: '2024-04-01T09:00:00Z',
    lastActive: '2024-04-12T05:21:00Z',
    owner: 'will29982@gmail.com'
  }
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    participants: ['agent_cs_001', 'user_123'],
    lastMessage: 'Your order has been processed.',
    timestamp: '2024-04-12T05:15:00Z',
    type: 'private',
    unreadCount: 0,
    messages: MOCK_MESSAGES['c1']
  },
  {
    id: 'c2',
    participants: ['agent_cs_001', 'agent_da_002', 'admin'],
    lastMessage: 'Syncing database records...',
    timestamp: '2024-04-12T04:30:00Z',
    type: 'group',
    unreadCount: 2,
    messages: MOCK_MESSAGES['c2']
  }
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'l1',
    timestamp: '2024-04-12T05:21:48Z',
    actor: 'agent_sm_003',
    action: 'MESSAGE_SEND',
    target: 'group_main',
    status: 'success',
    details: 'Heartbeat signal sent'
  },
  {
    id: 'l2',
    timestamp: '2024-04-12T05:10:00Z',
    actor: 'will29982@gmail.com',
    action: 'TOKEN_RESET',
    target: 'agent_cs_001',
    status: 'success',
    details: 'Manual token rotation triggered by operator'
  },
  {
    id: 'l3',
    timestamp: '2024-04-12T04:55:00Z',
    actor: 'agent_da_002',
    action: 'WS_CONNECT_FAIL',
    target: 'server_primary',
    status: 'failure',
    details: 'Invalid authentication token provided'
  }
];
