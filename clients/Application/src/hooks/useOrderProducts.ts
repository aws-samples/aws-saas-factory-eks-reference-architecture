import { useState, useCallback, useMemo } from 'react';
import { Product } from '../types/Product';
import { LineItem } from '../types/Order';

export const useOrderProducts = () => {
  const [orderProducts, setOrderProducts] = useState<LineItem[]>([]);

  const initializeProducts = useCallback((products: Product[]) => {
    setOrderProducts(products.map((p) => ({ product: p })));
  }, []);

  const handleAdd = useCallback((lineItem: LineItem) => {
    setOrderProducts(prevItems =>
      prevItems.map(item => {
        if (item.product.productId === lineItem.product.productId) {
          return {
            ...item,
            quantity: item.quantity ? item.quantity + 1 : 1,
          };
        }
        return item;
      })
    );
  }, []);

  const handleRemove = useCallback((lineItem: LineItem) => {
    setOrderProducts(prevItems =>
      prevItems.map(item => {
        if (item.product.productId === lineItem.product.productId) {
          return {
            ...item,
            quantity: item.quantity && item.quantity > 1 ? item.quantity - 1 : undefined,
          };
        }
        return item;
      })
    );
  }, []);

  const hasProductQuantity = useCallback((): boolean => {
    return orderProducts.filter(p => !!p.quantity).length > 0;
  }, [orderProducts]);

  const getOrderData = useMemo(() => {
    return orderProducts
      .filter(p => !!p.quantity)
      .map(p => ({
        productId: p.product.productId,
        price: p.product.price,
        quantity: p.quantity!,
      }));
  }, [orderProducts]);

  return {
    orderProducts,
    initializeProducts,
    handleAdd,
    handleRemove,
    hasProductQuantity,
    getOrderData
  };
};