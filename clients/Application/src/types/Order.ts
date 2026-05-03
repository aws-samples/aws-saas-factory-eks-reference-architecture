// Order interfaces matching Angular version
export interface OrderProduct {
  productId: string;
  price: number;
  quantity: number;
}

export interface Order {
  key: string;
  tenantId: string;
  orderId: string;
  orderName: string;
  orderProducts: OrderProduct[];
}

// For order creation form
export interface LineItem {
  product: import('./Product').Product;
  quantity?: number;
}