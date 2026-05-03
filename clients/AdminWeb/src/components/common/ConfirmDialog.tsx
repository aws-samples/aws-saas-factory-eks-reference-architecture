import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
} from '@mui/material';
import '../../styles/components.css';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  severity?: 'info' | 'warning' | 'error';
  icon?: string;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  severity = 'info',
  icon,
}) => {


  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{ className: 'confirm-dialog' }}
    >
      <DialogTitle className={`confirm-dialog-title ${severity}`}>
        {icon && <span>{icon}</span>}
        {title}
      </DialogTitle>
      <DialogContent className="confirm-dialog-content">
        <Typography className="confirm-dialog-message">
          {message}
        </Typography>
      </DialogContent>
      <DialogActions className="confirm-dialog-actions">
        <Button 
          onClick={onClose}
          disabled={isLoading}
          className="confirm-dialog-button cancel"
        >
          {cancelText}
        </Button>
        <Button 
          onClick={onConfirm}
          variant="contained"
          disabled={isLoading}
          className={`confirm-dialog-button confirm ${severity}`}
        >
          {isLoading ? <CircularProgress className="confirm-dialog-loading" /> : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;