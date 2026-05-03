// Product interface matching Angular version
export interface Product {
  key: string;
  tenantId: string;
  productId: string;
  name: string;
  price: number;
  sku: string;
  category: string;
  pictureUrl?: string;
}