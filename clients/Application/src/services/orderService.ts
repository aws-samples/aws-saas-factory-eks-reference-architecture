// Order service matching Angular version with JWT token support
import { httpClient } from './httpClient';
import { Order } from '../types/Order';
import { environment } from '../config/environment';

class OrderService {
  private get baseUrl(): string {
    return `${environment.apiUrl}orders`;
  }

  async fetch(): Promise<Order[]> {
    const response = await httpClient.get<Order[]>(this.baseUrl);
    return response.data;
  }

  async get(orderId: string): Promise<Order> {
    const url = `${this.baseUrl}/${orderId}`;
    const response = await httpClient.get<Order>(url);
    return response.data;
  }

  async create(order: Omit<Order, 'key' | 'tenantId' | 'orderId'>): Promise<Order> {
    const response = await httpClient.post<Order>(this.baseUrl, order);
    return response.data;
  }
}

export const orderService = new OrderService();