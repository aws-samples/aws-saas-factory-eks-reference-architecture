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
  Chip,
  IconButton,
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types/User';
import { userService } from '../../services/userService';
import ErrorBoundary from '../../components/ErrorBoundary';

const UserListContent: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');
      const data = await userService.fetch();
      console.log('User data received:', data);
      
      // Just set the data as-is, handle safety in rendering
      if (data && Array.isArray(data)) {
        if (data.length > 0) {
          console.log('First user object:', data[0]);
          console.log('Available keys:', Object.keys(data[0]));
        }
        setUsers(data);
      } else {
        setUsers([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch users');
      console.error('Error fetching users:', err);
      setUsers([]); // Set empty array on error
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleAddUser = () => {
    navigate('/users/create');
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status?: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return 'success';
      case 'unconfirmed':
        return 'warning';
      case 'archived':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <div>
        <Typography variant="h4" className="page-title">
          Users
        </Typography>
        <Typography variant="body2" className="page-subtitle">
          Manage user accounts and permissions
        </Typography>
      </div>

      {error && (
        <Alert severity="error" className="error-alert">
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Box className="loading-container">
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <IconButton
              onClick={() => fetchUsers(true)}
              disabled={isLoading || isRefreshing}
              size="small"
            >
              <RefreshIcon />
            </IconButton>
          </Box>
          <TableContainer component={Paper} className="unified-table-container">
          <Table>
            <TableHead className="unified-table-head">
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Modified Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Enabled</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" className="unified-table-empty">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.filter(user => user != null).map((user, index) => {
                  const email = user?.email || user?.username || 'unknown@example.com';
                  const userRole = user?.user_role || user?.role || 'User';
                  const status = user?.status || 'Unknown';
                  const enabled = typeof user?.enabled === 'boolean' ? user.enabled : true;
                  const modified = user?.modified || new Date().toISOString();
                  
                  return (
                    <TableRow key={email || index} className="unified-table-row">
                      <TableCell className="unified-table-email">{email}</TableCell>
                      <TableCell>
                        <Chip 
                          label={userRole} 
                          size="small"
                          className="user-role-chip"
                        />
                      </TableCell>
                      <TableCell className="unified-table-secondary">{formatDate(modified)}</TableCell>
                      <TableCell>
                        <Chip 
                          label={status} 
                          color={getStatusColor(status)}
                          size="small"
                          className="user-chip"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={enabled ? 'Yes' : 'No'} 
                          color={enabled ? 'success' : 'error'}
                          size="small"
                          className="user-chip"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </TableContainer>
        </>
      )}

      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddUser}
        >
          Add User
        </Button>
      </Box>
    </Box>
  );
};

const UserList: React.FC = () => {
  return (
    <ErrorBoundary>
      <UserListContent />
    </ErrorBoundary>
  );
};

export default UserList;