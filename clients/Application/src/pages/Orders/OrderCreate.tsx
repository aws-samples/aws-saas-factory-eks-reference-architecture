import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Add as AddIcon, Remove as RemoveIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { Order } from '../../types/Order';
import { productService } from '../../services/productService';
import { orderService } from '../../services/orderService';
import { handleApiError } from '../../types/errors';
import { useOrderProducts } from '../../hooks/useOrderProducts';
import { COMMON_STYLES, INPUT_STYLES } from '../../constants/styles';

const OrderCreate: React.FC = () => {
  const navigate = useNavigate();
  const [orderName, setOrderName] = useState('');
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  
  const {
    orderProducts,
    initializeProducts,
    handleAdd,
    handleRemove,
    hasProductQuantity,
    getOrderData
  } = useOrderProducts();

  const fetchProducts = useCallback(async () => {
    try {
      setIsLoadingProducts(true);
      setError('');
      const products = await productService.fetch();
      initializeProducts(products);
    } catch (error: any) {
      setError(handleApiError(error));
    } finally {
      setIsLoadingProducts(false);
    }
  }, [initializeProducts]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!orderName.trim() || !hasProductQuantity()) {
      return;
    }

    try {
      setIsSaving(true);
      setError('');

      // Same data structure as Angular's submit function
      const orderData: Omit<Order, 'key' | 'tenantId' | 'orderId'> = {
        orderName: orderName.trim(),
        orderProducts: getOrderData,
      };

      await orderService.create(orderData);
      navigate('/orders');
    } catch (error: any) {
      setError(handleApiError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = useCallback(() => {
    navigate('/orders');
  }, [navigate]);

  const isFormValid = useMemo(() => orderName.trim() && hasProductQuantity(), [orderName, hasProductQuantity]);

  if (isLoadingProducts) {
    return (
      <Box sx={COMMON_STYLES.loadingContainer}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <div>
        <Typography variant="h4" className="page-title">
          Create Order
        </Typography>
        <Typography variant="body2" className="page-subtitle">
          Create a new order by selecting products and quantities
        </Typography>
      </div>

      {error && (
        <Alert severity="error" sx={COMMON_STYLES.marginBottom2}>
          {error}
        </Alert>
      )}

      <Card sx={COMMON_STYLES.modernCard}>
        <form onSubmit={handleSubmit}>
          <CardContent sx={{ p: 4 }}>
            <TextField
              label="Order Name"
              placeholder="Enter order name"
              value={orderName}
              onChange={(e) => setOrderName(e.target.value)}
              required
              fullWidth
              variant="outlined"
              sx={{ 
                ...COMMON_STYLES.marginBottom4,
                ...INPUT_STYLES.outlined
              }}
            />

            <Typography variant="h6" gutterBottom>
              Products
            </Typography>

            <TableContainer component={Paper} sx={COMMON_STYLES.marginBottom2}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Product Name</TableCell>
                    <TableCell>Price</TableCell>
                    <TableCell>Quantity</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderProducts.map((lineItem) => (
                    <TableRow key={lineItem.product.productId}>
                      <TableCell>{lineItem.product.name}</TableCell>
                      <TableCell>${lineItem.product.price.toFixed(2)}</TableCell>
                      <TableCell>{lineItem.quantity || 0}</TableCell>
                      <TableCell align="center">
                        <IconButton
                          onClick={() => handleAdd(lineItem)}
                          color="primary"
                          size="small"
                        >
                          <AddIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => handleRemove(lineItem)}
                          color="error"
                          size="small"
                          disabled={!lineItem.quantity}
                        >
                          <RemoveIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>

          <CardActions sx={COMMON_STYLES.flexEnd}>
            <Button
              variant="outlined"
              color="secondary"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={!isFormValid || isSaving}
              startIcon={isSaving ? <CircularProgress size={20} /> : null}
            >
              {isSaving ? 'Creating...' : 'Submit'}
            </Button>
          </CardActions>
        </form>
      </Card>
    </Box>
  );
};

export default OrderCreate;