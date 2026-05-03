// Product service matching Angular version with JWT token support
import { httpClient } from './httpClient';
import { Product } from '../types/Product';
import { environment } from '../config/environment';

class ProductService {
  private get baseUrl(): string {
    return `${environment.apiUrl}products`;
  }

  async fetch(): Promise<Product[]> {
    const response = await httpClient.get<Product[]>(this.baseUrl);
    return response.data;
  }

  async get(productId: string): Promise<Product> {
    const url = `${this.baseUrl}/${productId}`;
    const response = await httpClient.get<Product>(url);
    return response.data;
  }

  async delete(product: Product): Promise<void> {
    const url = `${this.baseUrl}/${product.tenantId}:${product.productId}`;
    await httpClient.delete(url);
  }

  async put(product: Product): Promise<Product> {
    const url = `${this.baseUrl}/${product.tenantId}:${product.productId}`;
    const response = await httpClient.put<Product>(url, product);
    return response.data;
  }

  async post(product: Omit<Product, 'key' | 'tenantId' | 'productId'>): Promise<Product> {
    const response = await httpClient.post<Product>(this.baseUrl, product);
    return response.data;
  }
}

export const productService = new ProductService();