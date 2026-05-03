import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { Order, OrderProduct } from '../../types/Order';
import { orderService } from '../../services/orderService';

const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Same tax rate as Angular
  const taxRate = 0.0899;

  useEffect(() => {
    if (id) {
      fetchOrder(id);
    }
  }, [id]);

  const fetchOrder = async (orderId: string) => {
    try {
      setIsLoading(true);
      setError('');
      console.log('Fetching order with ID:', orderId); // For debugging
      const orderData = await orderService.get(orderId);
      setOrder(orderData);
    } catch (err: any) {

      setError(err.response?.data?.message || err.message || 'Failed to fetch order');
    } finally {
      setIsLoading(false);
    }
  };

  // Same as Angular's today() function
  const today = (): string => {
    return new Date().toLocaleDateString();
  };

  // Same as Angular's sum() function
  const sum = (op: OrderProduct): number => {
    return op.price * op.quantity;
  };

  // Same as Angular's tax() function
  const tax = (op: OrderProduct): number => {
    return sum(op) * taxRate;
  };

  // Same as Angular's total() function
  const total = (op: OrderProduct): number => {
    return sum(op) + tax(op);
  };

  // Same as Angular's subTotal() function
  const subTotal = (order: Order): number => {
    return order.orderProducts
      .map((op) => op.price * op.quantity)
      .reduce((acc, curr) => acc + curr, 0);
  };

  // Same as Angular's calcTax() function
  const calcTax = (order: Order): number => {
    return subTotal(order) * taxRate;
  };

  // Same as Angular's final() function
  const final = (order: Order): number => {
    return subTotal(order) + calcTax(order);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error">
          {error}
        </Alert>
      </Box>
    );
  }

  if (!order) {
    return (
      <Box>
        <Alert severity="error">
          Order not found
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: 2 }}>
      {/* Page Header */}
      <div>
        <Typography variant="h4" className="page-title">
          Order Details
        </Typography>
        <Typography variant="body2" className="page-subtitle">
          Order #{id} | Date: {today()}
        </Typography>
      </div>

      {/* Services / Products Table */}
      <Card className="card-with-top-border" sx={{ mb: 3 }}>
        <CardHeader title="Services / Products" />
        <CardContent>
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
                  <TableCell>Item / Details</TableCell>
                  <TableCell align="center">Unit Cost</TableCell>
                  <TableCell align="center">Sum Cost</TableCell>
                  <TableCell align="center">Discount</TableCell>
                  <TableCell align="center">Tax</TableCell>
                  <TableCell align="center">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {order.orderProducts.map((op, index) => (
                  <TableRow 
                    key={index}
                    sx={{ 
                      '&:nth-of-type(even)': { backgroundColor: '#f8f9fa' },
                      '&:hover': { backgroundColor: '#e3f2fd' },
                      '& .MuiTableCell-root': {
                        borderBottom: '1px solid #dee2e6',
                        py: 1
                      }
                    }}
                  >
                    <TableCell>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>{op.productId}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        ${op.price.toFixed(2)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Before Tax
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        ${sum(op).toFixed(2)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {op.quantity} Units
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        $0.00
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        None
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        ${tax(op).toFixed(2)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Sales Tax 8.9%
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#2e7d32' }}>
                        ${total(op).toFixed(2)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Totals Table */}
      <Card className="card-with-top-border" sx={{ mb: 3 }}>
        <CardContent>
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
                  <TableCell align="center">Sub Total</TableCell>
                  <TableCell align="center">Discount</TableCell>
                  <TableCell align="center">Total</TableCell>
                  <TableCell align="center">Tax</TableCell>
                  <TableCell align="center">Final</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow sx={{ 
                  '& .MuiTableCell-root': {
                    borderBottom: '1px solid #dee2e6',
                    py: 1.5
                  }
                }}>
                  <TableCell align="center">
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      ${subTotal(order).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      -$0.00
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      ${subTotal(order).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      ${calcTax(order).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                      ${final(order).toFixed(2)}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Comments / Notes */}
      <Card className="card-with-top-border" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontStyle: 'italic' }}>
            Comments / Notes
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Lorem ipsum dolor sit amet, consectetur adipisicing elit. Odit
            repudiandae numquam sit facere blanditiis, quasi distinctio ipsam?
            Libero odit ex expedita, facere sunt, possimus consectetur dolore,
            nobis iure amet vero.
          </Typography>
        </CardContent>
      </Card>

      {/* Footer */}
      <Box sx={{ textAlign: 'center', mt: 4, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Thank you for choosing the ECS SaaS Reference Architecture.
          <br />
          We hope to see you again soon
          <br />
          <strong>AWS</strong>
        </Typography>
      </Box>
    </Box>
  );
};

export default OrderDetail;