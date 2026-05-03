import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { orderService } from '../../services/orderService';
import ErrorBoundary from '../../components/ErrorBoundary';

const OrderListContent: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');
      const data = await orderService.fetch();
      
      console.log('Raw order data:', data);
      
      // Absolutely safe processing
      if (data && Array.isArray(data)) {
        setOrders(data);
      } else {
        setOrders([]);
      }
    } catch (err: any) {
      setError('Failed to fetch orders');
      console.error('Error fetching orders:', err);
      setOrders([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleOrderClick = (order: any) => {
    const tenantId = order?.tenantId || 'unknown';
    const orderId = order?.orderId || 'unknown';
    navigate(`/orders/${tenantId}:${orderId}`);
  };

  const handleCreateOrder = () => {
    navigate('/orders/create');
  };

  const getOrderName = (order: any): string => {
    return order?.orderName || 'Unnamed Order';
  };

  const getLineItemsCount = (order: any): number => {
    if (!order || !order.orderProducts) return 0;
    if (!Array.isArray(order.orderProducts)) return 0;
    return order.orderProducts.length;
  };

  const calculateTotal = (order: any): number => {
    if (!order || !order.orderProducts) return 0;
    if (!Array.isArray(order.orderProducts)) return 0;
    
    let total = 0;
    for (let i = 0; i < order.orderProducts.length; i++) {
      const product = order.orderProducts[i];
      if (product) {
        const price = typeof product.price === 'number' ? product.price : 0;
        const quantity = typeof product.quantity === 'number' ? product.quantity : 0;
        total += price * quantity;
      }
    }
    return total;
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <div>
        <Typography variant="h4" className="page-title">
          Orders
        </Typography>
        <Typography variant="body2" className="page-subtitle">
          Manage customer orders and track order status
        </Typography>
      </div>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <IconButton
          onClick={() => fetchOrders(true)}
          disabled={isLoading || isRefreshing}
          size="small"
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      <TableContainer 
        component={Paper} 
        sx={{ 
          border: '1px solid #e0e0e0',
          borderRadius: 2,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ 
              backgroundColor: '#f8f9fa',
              '& .MuiTableCell-head': {
                fontWeight: 600,
                color: '#2c3e50',
                borderBottom: '2px solid #dee2e6',
                fontSize: '0.95rem'
              }
            }}>
              <TableCell>Name</TableCell>
              <TableCell>Line Items</TableCell>
              <TableCell>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!orders || orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 4, color: '#6c757d' }}>
                  No orders found
                </TableCell>
              </TableRow>
            ) : (
              orders.filter(order => order != null).slice(0, 10).map((order, index) => (
                <TableRow 
                  key={`safe-order-${index}`}
                  sx={{ 
                    '&:nth-of-type(even)': { backgroundColor: '#f8f9fa' },
                    '&:hover': { backgroundColor: '#e3f2fd' },
                    '& .MuiTableCell-root': {
                      borderBottom: '1px solid #dee2e6',
                      py: 1.5
                    }
                  }}
                >
                  <TableCell>
                    <Button
                      variant="text"
                      onClick={() => handleOrderClick(order)}
                      sx={{ 
                        textTransform: 'none', 
                        p: 0, 
                        minWidth: 'auto',
                        color: '#1976d2',
                        fontWeight: 500,
                        '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' }
                      }}
                    >
                      {getOrderName(order)}
                    </Button>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>
                    {getLineItemsCount(order)}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#2e7d32' }}>
                    ${calculateTotal(order).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateOrder}
        >
          Create Order
        </Button>
      </Box>
    </Box>
  );
};

const OrderList: React.FC = () => {
  return (
    <ErrorBoundary>
      <OrderListContent />
    </ErrorBoundary>
  );
};

export default OrderList;