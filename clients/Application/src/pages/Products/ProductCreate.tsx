import React, { useState } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  TextField,
  Button,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { productService } from '../../services/productService';
import { handleApiError } from '../../types/errors';

const ProductCreate: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    sku: '',
    category: '',
  });

  const [formErrors, setFormErrors] = useState({
    name: '',
    price: '',
  });

  const categories = ['category1', 'category2', 'category3', 'category4'];

  const handleInputChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear field error when user starts typing
    if (formErrors[field as keyof typeof formErrors]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateForm = (): boolean => {
    const errors = {
      name: '',
      price: '',
    };

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.price.trim()) {
      errors.price = 'Price is required';
    } else if (isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
      errors.price = 'Price must be a valid positive number';
    }

    setFormErrors(errors);
    return !errors.name && !errors.price;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const productData: any = {
        name: formData.name.trim(),
        price: Number(formData.price),
        sku: formData.sku.trim(),
        category: formData.category,
      };

      await productService.post(productData);
      navigate('/products');
    } catch (error: any) {
      setError(handleApiError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/products');
  };

  const isFormValid = formData.name.trim() && formData.price.trim() && !formErrors.name && !formErrors.price;

  return (
    <Box>
      <div>
        <Typography variant="h4" className="page-title">
          Create Product
        </Typography>
        <Typography variant="body2" className="page-subtitle">
          Add a new product to your catalog
        </Typography>
      </div>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card className="modern-card" sx={{ maxWidth: 600 }}>
        <form onSubmit={handleSubmit}>
          <CardContent className="modern-card-content">
            <Box className="form-fields-container">
              <TextField
                label="Product Name"
                placeholder="Enter product name"
                value={formData.name}
                onChange={handleInputChange('name')}
                error={!!formErrors.name}
                helperText={formErrors.name}
                required
                fullWidth
                variant="outlined"
                className="modern-text-field"
              />

              <TextField
                label="Price"
                placeholder="0.00"
                type="number"
                value={formData.price}
                onChange={handleInputChange('price')}
                error={!!formErrors.price}
                helperText={formErrors.price}
                required
                fullWidth
                variant="outlined"
                inputProps={{ min: 0, step: 0.01 }}
                InputProps={{
                  startAdornment: <Box sx={{ mr: 1, color: 'text.secondary' }}>$</Box>
                }}
                className="modern-text-field"
              />

              <TextField
                label="SKU"
                placeholder="Enter product SKU"
                value={formData.sku}
                onChange={handleInputChange('sku')}
                fullWidth
                variant="outlined"
                className="modern-text-field"
              />

              <TextField
                select
                label="Category"
                value={formData.category}
                onChange={handleInputChange('category')}
                fullWidth
                variant="outlined"
                className="modern-text-field"
              >
                {categories.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </CardContent>

          <CardActions className="modern-button-container">
            <Button
              variant="outlined"
              color="secondary"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={!isFormValid || isLoading}
              startIcon={isLoading ? <CircularProgress size={20} /> : null}
            >
              {isLoading ? 'Creating...' : 'Submit'}
            </Button>
          </CardActions>
        </form>
      </Card>
    </Box>
  );
};

export default ProductCreate;