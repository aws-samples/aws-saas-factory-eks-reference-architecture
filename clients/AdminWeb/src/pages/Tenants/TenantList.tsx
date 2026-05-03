import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Skeleton,
} from "@mui/material";
import {
  Add as AddIcon,
  FindInPageOutlined as FindInPageOutlinedIcon,
  DeleteOutlined as DeleteOutlinedIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { Tenant } from "../../models/tenant";
import DeleteTenantDialog from "../../components/DeleteTenantDialog";

import { useTenants } from "../../hooks/useTenants";
import { TIER_COLORS, STATUS_COLORS } from "../../constants/pricing";
import "../../styles/index.css";

// Constants definition
const SCROLL_THRESHOLD = 800; // Scroll threshold in pixels
const DEBOUNCE_DELAY = 100; // Debounce delay in milliseconds
const SKELETON_CARD_COUNT = 6; // Number of skeleton cards to show during loading

// Skeleton card component
const SkeletonCard: React.FC = () => (
  <Grid item xs={12} sm={6} md={4}>
    <Card className="glass-card tenant-card">
      <CardContent>
        <div className="tenant-card-header">
          <Skeleton variant="text" width="70%" height={28} />
          <div className="tenant-card-actions">
            <Skeleton variant="circular" width={32} height={32} />
            <Skeleton variant="circular" width={32} height={32} />
          </div>
        </div>
        <Skeleton variant="text" width="60%" height={20} sx={{ mb: 2 }} />
        <div className="tenant-card-chips" style={{ marginBottom: 16 }}>
          <Skeleton variant="rounded" width={60} height={24} />
          <Skeleton variant="rounded" width={80} height={24} />
        </div>
        <Skeleton variant="text" width="90%" height={20} />
        <Skeleton variant="text" width="70%" height={20} />
      </CardContent>
    </Card>
  </Grid>
);

// Debounce hook
const useDebounce = (callback: () => void, delay: number, deps: any[]) => {
  const debouncedCallback = useCallback(debounce(callback, delay), [
    callback,
    delay,
    ...deps,
  ]);
  return debouncedCallback;
};

const debounce = (func: () => void, wait: number) => {
  let timeout: NodeJS.Timeout;
  return () => {
    clearTimeout(timeout);
    timeout = setTimeout(func, wait);
  };
};

// Memoized tenant card component
const TenantCard = React.memo<{
  tenant: Tenant & Record<string, any>;
  index: number;
  onDelete: (tenant: Tenant) => void;
  onNavigate: (tenantId: string, state: any) => void;
  getTierColor: (tier: string) => string;
  getStatusColor: (status: string) => string;
}>(({ tenant, index, onDelete, onNavigate, getTierColor, getStatusColor }) => {
  // Memoize data extraction logic
  const tenantData = useMemo(() => {
    const tenantId = tenant.tenantId || `tenant-${index}`;
    const tenantName =
      tenant.tenantData?.tenantName ||
      (tenant as any).tenantName ||
      (tenant as any).name ||
      "Unknown Tenant";
    const email =
      tenant.tenantData?.email || (tenant as any).email || "No email";
    const tier = tenant.tenantData?.tier || (tenant as any).tier || "unknown";
    const status =
      tenant.tenantRegistrationData?.registrationStatus ||
      (tenant as any).registrationStatus ||
      (tenant as any).status ||
      (tenant as any).state ||
      (tenant as any).tenantStatus ||
      "complete";
    const isActive = tenant.sbtaws_active !== false;

    return { tenantId, tenantName, email, tier, status, isActive };
  }, [tenant, index]);

  const handleNavigate = useCallback(() => {
    onNavigate(tenantData.tenantId, {
      tenantName: tenantData.tenantName,
      email: tenantData.email,
      tier: tenantData.tier,
      tenantRegistrationId:
        tenant.tenantRegistrationData?.tenantRegistrationId ||
        (tenant as any).tenantRegistrationId ||
        tenant.tenantId,
      sbtaws_active: tenant.sbtaws_active,
    });
  }, [tenantData, tenant, onNavigate]);

  const handleDelete = useCallback(() => {
    onDelete(tenant);
  }, [tenant, onDelete]);

  return (
    <Grid item xs={12} sm={6} md={4}>
      <Card
        className="glass-card tenant-card"
        sx={{
          backgroundColor: tenantData.isActive ? "inherit" : "#f5f5f5",
          color: tenantData.isActive ? "inherit" : "#9e9e9e",
          opacity: tenantData.isActive ? 1 : 0.6,
        }}
      >
        <CardContent>
          <div className="tenant-card-header">
            <Typography
              variant="h6"
              component="div"
              className="tenant-card-title"
            >
              {tenantData.tenantName}
            </Typography>
            <div className="tenant-card-actions">
              <IconButton
                size="small"
                onClick={handleNavigate}
                sx={{ color: "#e9710c", mr: 0 }}
              >
                <FindInPageOutlinedIcon />
              </IconButton>
              <IconButton
                size="small"
                onClick={handleDelete}
                disabled={!tenantData.isActive}
                sx={{
                  color: tenantData.isActive ? "#6b7280" : "#d1d5db",
                  cursor: tenantData.isActive ? "pointer" : "not-allowed",
                }}
              >
                <DeleteOutlinedIcon />
              </IconButton>
            </div>
          </div>

          <Typography variant="body2" className="tenant-card-email">
            {tenantData.email}
          </Typography>

          <div className="tenant-card-chips">
            <Chip
              label={tenantData.tier.toUpperCase()}
              color={getTierColor(tenantData.tier.toLowerCase()) as any}
              size="small"
            />
            <Chip
              label={tenantData.status.toUpperCase()}
              color={getStatusColor(tenantData.status.toLowerCase()) as any}
              size="small"
            />
          </div>

          <Typography variant="body2" className="tenant-card-id">
            ID: {tenantData.tenantId}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
});

TenantCard.displayName = "TenantCard";

const TenantList: React.FC = () => {
  const {
    tenants,
    loading,
    loadingMore,
    error,
    hasMore,
    loadTenants,
    loadMoreTenants,
    deleteTenant,
  } = useTenants();
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    tenant: Tenant | null;
  }>({
    open: false,
    tenant: null,
  });
  const navigate = useNavigate();

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Optimize scroll event - load earlier and apply debouncing
  const handleScroll = useCallback(() => {
    if (loadingMore || !hasMore) return;

    const scrollPosition =
      window.innerHeight + document.documentElement.scrollTop;
    const documentHeight = document.documentElement.offsetHeight;

    if (scrollPosition >= documentHeight - SCROLL_THRESHOLD) {
      loadMoreTenants();
    }
  }, [loadMoreTenants, loadingMore, hasMore]);

  // Apply debouncing
  const debouncedHandleScroll = useDebounce(handleScroll, DEBOUNCE_DELAY, [
    loadMoreTenants,
    loadingMore,
    hasMore,
  ]);

  useEffect(() => {
    // Improve performance with passive option
    window.addEventListener("scroll", debouncedHandleScroll, { passive: true });
    return () => window.removeEventListener("scroll", debouncedHandleScroll);
  }, [debouncedHandleScroll]);

  // Memoize color functions
  const getTierColor = useCallback((tier: string) => {
    return (
      TIER_COLORS[tier.toLowerCase() as keyof typeof TIER_COLORS] || "default"
    );
  }, []);

  const getStatusColor = useCallback((status: string) => {
    return (
      STATUS_COLORS[status.toLowerCase() as keyof typeof STATUS_COLORS] ||
      "default"
    );
  }, []);

  const handleDeleteTenant = useCallback((tenant: Tenant) => {
    setDeleteDialog({ open: true, tenant });
  }, []);

  const handleNavigate = useCallback(
    (tenantId: string, state: any) => {
      navigate(`/tenants/${tenantId}`, { state });
    },
    [navigate]
  );

  const confirmDelete = useCallback(async () => {
    if (deleteDialog.tenant) {
      try {
        await deleteTenant(deleteDialog.tenant);
        setDeleteDialog({ open: false, tenant: null });
      } catch (error) {
        // Error is handled by the hook
      }
    }
  }, [deleteDialog.tenant, deleteTenant]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "200px",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <div className="page-container">
      <div className="container">
        <Box
          className="tenant-header-sticky"
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <Typography variant="h4" className="page-title">
              Tenants
            </Typography>
            <Typography variant="body2" className="page-subtitle">
              Manage and monitor all tenant organizations in your SaaS platform
            </Typography>
          </div>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/tenants/create")}
            className="tenant-create-button"
          >
            Create Tenant
          </Button>
        </Box>

        {error && (
          <Alert
            severity="error"
            className="error-alert"
            sx={{ marginBottom: "24px" }}
          >
            {error}
          </Alert>
        )}

        <Grid container spacing={3}>
          {tenants.map((tenant: Tenant & Record<string, any>, index) => {
            const tenantId = tenant.tenantId || `tenant-${index}`;
            return (
              <TenantCard
                key={tenantId}
                tenant={tenant}
                index={index}
                onDelete={handleDeleteTenant}
                onNavigate={handleNavigate}
                getTierColor={getTierColor}
                getStatusColor={getStatusColor}
              />
            );
          })}

          {/* Show skeleton cards during loading */}
          {loadingMore &&
            Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
              <SkeletonCard key={`skeleton-${index}`} />
            ))}
        </Grid>

        {loadingMore && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              mt: 3,
              alignItems: "center",
              gap: 2,
            }}
          >
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading more tenants...
            </Typography>
          </Box>
        )}

        {!hasMore && tenants.length > 0 && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
            <Typography variant="body2" color="text.secondary">
              All tenants have been loaded.
            </Typography>
          </Box>
        )}

        <DeleteTenantDialog
          open={deleteDialog.open}
          onClose={() => setDeleteDialog({ open: false, tenant: null })}
          onConfirm={confirmDelete}
          tenantName={
            deleteDialog.tenant?.tenantData?.tenantName ||
            (deleteDialog.tenant as any)?.tenantName ||
            (deleteDialog.tenant as any)?.name ||
            "Unknown Tenant"
          }
        />
      </div>
    </div>
  );
};

export default TenantList;
