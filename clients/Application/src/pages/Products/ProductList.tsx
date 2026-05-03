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
  IconButton,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { Product } from '../../types/Product';
import { productService } from '../../services/productService';
import { handleApiError } from '../../types/errors';
import ErrorBoundary from '../../components/ErrorBoundary';

const ProductListContent: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');
      const data = await productService.fetch();
      
      // Just set the data as-is, handle safety in rendering
      if (data && Array.isArray(data)) {
        setProducts(data);
      } else {
        setProducts([]);
      }
    } catch (error: any) {
      setError(handleApiError(error));
      setProducts([]); // Set empty array on error
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleEdit = (product: any) => {
    // Same format as Angular: tenantId:productId
    const tenantId = product?.tenantId || 'unknown';
    const productId = product?.productId || 'unknown';
    navigate(`/products/${tenantId}:${productId}/edit`);
  };



  const handleCreate = () => {
    navigate('/products/create');
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
          Products
        </Typography>
        <Typography variant="body2" className="page-subtitle">
          Manage your product catalog and inventory
        </Typography>
      </div>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <IconButton
          onClick={() => fetchProducts(true)}
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
              <TableCell>Price</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: '#6c757d' }}>
                  No products found
                </TableCell>
              </TableRow>
            ) : (
              products.filter(product => product != null).map((product, index) => {
                const name = product?.name || 'Unnamed Product';
                const price = typeof product?.price === 'number' ? product.price : 0;
                const sku = product?.sku ? String(product.sku) : 'N/A';
                const category = product?.category || 'Uncategorized';
                const key = product?.key || `${product?.tenantId || 'unknown'}:${product?.productId || index}`;
                
                return (
                  <TableRow 
                    key={key}
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
                      <Button
                        variant="text"
                        onClick={() => handleEdit(product)}
                        sx={{ 
                          textTransform: 'none', 
                          p: 0, 
                          minWidth: 'auto',
                          color: '#1976d2',
                          fontWeight: 500,
                          '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' }
                        }}
                      >
                        {name}
                      </Button>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>${price.toFixed(2)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{sku}</TableCell>
                    <TableCell>{category}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        onClick={() => handleEdit(product)}
                        color="primary"
                        size="small"
                        sx={{ 
                          '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.1)' }
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreate}
        >
          Create Product
        </Button>
      </Box>
    </Box>
  );
};

const ProductList: React.FC = () => {
  return (
    <ErrorBoundary>
      <ProductListContent />
    </ErrorBoundary>
  );
};

export default ProductList;