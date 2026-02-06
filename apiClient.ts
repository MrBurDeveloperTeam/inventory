/**
 * API Client for Cloudflare Worker
 * Handles all data operations via the worker at https://sso.mrburstudio.com/api/
 */

const API_BASE = 'https://sso.mrburstudio.com/api';

interface ApiRequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
}

async function apiRequest<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
    const { method = 'GET', body } = options;

    const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        credentials: 'include', // Send cookies
        headers: {
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`API Error ${res.status}: ${errorText}`);
    }

    return res.json();
}

// ============== Room Operations ==============

interface CreateRoomPayload {
    id: string;
    user_id: string;
    name: string;
    pos_x: number;
    pos_y: number;
}

interface UpdateRoomPayload {
    name?: string;
    pos_x?: number;
    pos_y?: number;
}

export const roomsApi = {
    create: (data: CreateRoomPayload) =>
        apiRequest<{ id: string; name: string; pos_x: number; pos_y: number }>('/rooms', {
            method: 'POST',
            body: data
        }),

    delete: (roomId: string) =>
        apiRequest<{ deleted: boolean }>(`/rooms/${roomId}`, { method: 'DELETE' }),

    update: (roomId: string, data: UpdateRoomPayload) =>
        apiRequest<{ updated: boolean }>(`/rooms/${roomId}`, { method: 'PATCH', body: data }),
};

// ============== Item Operations ==============

interface ItemData {
    id: string;
    room_id: string;
    user_id: string;
    name: string;
    brand?: string;
    code?: string;
    quantity: number;
    price: number;
    uom?: string;
    vendor?: string;
    category?: string;
    description?: string;
    expiry_date?: string | null;
}

interface BatchData {
    id: string;
    item_id?: string;
    qty: number;
    unit_price: number;
    expiry_date?: string | null;
}

interface HistoryData {
    id: string;
    user_id: string;
    room_id: string;
    occurred_at: string;
    product_name: string;
    brand?: string;
    code?: string;
    vendor?: string;
    qty: number;
    unit_price: number;
    total_price: number;
    location?: string;
    category?: string;
    uom?: string;
    expiry_date?: string | null;
    description?: string;
}

interface ReceiveStockPayload {
    item: ItemData;
    batches: BatchData[];
    history?: HistoryData;
}

interface TransferPayload {
    sourceItem?: ItemData & { batches?: BatchData[] };
    destinationItem?: ItemData & { batches?: BatchData[] };
    deletedBatchIds?: string[];
}

interface UpdateItemPayload {
    name?: string;
    brand?: string;
    code?: string;
    quantity?: number;
    price?: number;
    uom?: string;
    vendor?: string;
    category?: string;
    description?: string;
    expiry_date?: string | null;
    user_id?: string;
}

export const itemsApi = {
    receive: (data: ReceiveStockPayload) =>
        apiRequest<{ success: boolean }>('/items', { method: 'POST', body: data }),

    delete: (itemId: string) =>
        apiRequest<{ deleted: boolean }>(`/items/${itemId}`, { method: 'DELETE' }),

    update: (itemId: string, data: UpdateItemPayload) =>
        apiRequest<{ updated: boolean }>(`/items/${itemId}`, { method: 'PATCH', body: data }),

    transfer: (data: TransferPayload) =>
        apiRequest<{ success: boolean }>('/items/transfer', { method: 'POST', body: data }),
};

// ============== Batch Operations ==============

interface UpdateBatchPayload {
    batch: BatchData;
    itemUpdate?: {
        id: string;
        quantity: number;
        price: number;
        expiry_date?: string | null;
    };
}

export const batchesApi = {
    update: (batchId: string, data: UpdateBatchPayload) =>
        apiRequest<{ success: boolean }>(`/batches/${batchId}`, { method: 'PATCH', body: data }),
};

// ============== Meta Operations ==============

interface UpdateMetaPayload {
    user_id: string;
    blueprint?: string | null;
    cat_position_x?: number;
    cat_position_y?: number;
}

export const metaApi = {
    update: (data: UpdateMetaPayload) =>
        apiRequest<unknown>('/meta', { method: 'PATCH', body: data }),
};

// ============== Log Operations ==============

interface LogData {
    id: string;
    user_id: string;
    room_id: string;
    room_name: string;
    action: string;
    details: string;
    created_at: string;
    actor_id?: string | null;
    before_value?: string | null;
    after_value?: string | null;
}

export const logsApi = {
    create: (data: LogData) =>
        apiRequest<LogData>('/logs', { method: 'POST', body: data }),
};

// ============== Bootstrap ==============

interface BootstrapResponse {
    loggedIn: boolean;
    user?: {
        profiles: unknown;
        meta: unknown[];
        rooms: unknown[];
        items_data: unknown[];
        history_data: unknown[];
        log_data: unknown[];
    };
    error?: string;
}

export const authApi = {
    bootstrap: () =>
        apiRequest<BootstrapResponse>('/bootstrap'),

    me: () =>
        apiRequest<{ loggedIn: boolean; user: { email: string; aud: string } | null }>('/me'),

    logout: () =>
        apiRequest<{ ok: boolean }>('/logout', { method: 'POST' }),
};

// ============== Combined Export ==============

export const apiClient = {
    rooms: roomsApi,
    items: itemsApi,
    batches: batchesApi,
    meta: metaApi,
    logs: logsApi,
    auth: authApi,
};

export default apiClient;
