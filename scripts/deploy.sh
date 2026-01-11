#!/bin/bash

# =====================================================
# HIVE Deployment Scripts
# =====================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="${SCRIPT_DIR}/../k8s"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =====================================================
# DEPLOYMENT FUNCTIONS
# =====================================================

deploy_staging() {
    log_info "Deploying to staging..."
    
    # Build and apply Kustomize
    kubectl apply -k "${K8S_DIR}/overlays/staging"
    
    # Wait for rollout
    kubectl rollout status deployment/staging-hive-backend -n hive-staging --timeout=300s
    kubectl rollout status deployment/staging-hive-admin -n hive-staging --timeout=300s
    
    log_info "Staging deployment complete!"
}

deploy_production() {
    log_info "Deploying to production..."
    
    # Confirm production deployment
    read -p "Are you sure you want to deploy to production? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        log_warn "Production deployment cancelled"
        exit 0
    fi
    
    # Build and apply Kustomize
    kubectl apply -k "${K8S_DIR}/overlays/production"
    
    # Wait for rollout
    kubectl rollout status deployment/hive-backend -n hive --timeout=300s
    kubectl rollout status deployment/hive-admin -n hive --timeout=300s
    
    log_info "Production deployment complete!"
}

rollback() {
    local env=$1
    local namespace="hive"
    
    if [[ "$env" == "staging" ]]; then
        namespace="hive-staging"
    fi
    
    log_info "Rolling back deployment in ${namespace}..."
    
    kubectl rollout undo deployment/hive-backend -n "${namespace}"
    kubectl rollout status deployment/hive-backend -n "${namespace}" --timeout=300s
    
    log_info "Rollback complete!"
}

check_health() {
    local env=$1
    local namespace="hive"
    
    if [[ "$env" == "staging" ]]; then
        namespace="hive-staging"
    fi
    
    log_info "Checking health in ${namespace}..."
    
    # Check pods
    echo "Pods:"
    kubectl get pods -n "${namespace}" -o wide
    
    # Check services
    echo -e "\nServices:"
    kubectl get svc -n "${namespace}"
    
    # Check HPA
    echo -e "\nHPA:"
    kubectl get hpa -n "${namespace}"
    
    # Check recent events
    echo -e "\nRecent Events:"
    kubectl get events -n "${namespace}" --sort-by='.lastTimestamp' | tail -10
}

scale() {
    local env=$1
    local replicas=$2
    local namespace="hive"
    
    if [[ "$env" == "staging" ]]; then
        namespace="hive-staging"
    fi
    
    log_info "Scaling backend to ${replicas} replicas in ${namespace}..."
    
    kubectl scale deployment/hive-backend -n "${namespace}" --replicas="${replicas}"
    kubectl rollout status deployment/hive-backend -n "${namespace}" --timeout=300s
    
    log_info "Scaling complete!"
}

logs() {
    local env=$1
    local namespace="hive"
    
    if [[ "$env" == "staging" ]]; then
        namespace="hive-staging"
    fi
    
    log_info "Streaming logs from ${namespace}..."
    
    kubectl logs -f -l app=hive-backend -n "${namespace}" --all-containers
}

# =====================================================
# DATABASE OPERATIONS
# =====================================================

db_migrate() {
    local env=$1
    local namespace="hive"
    
    if [[ "$env" == "staging" ]]; then
        namespace="hive-staging"
    fi
    
    log_info "Running database migrations in ${namespace}..."
    
    # Get a backend pod
    POD=$(kubectl get pods -n "${namespace}" -l app=hive-backend -o jsonpath='{.items[0].metadata.name}')
    
    # Run migrations
    kubectl exec -n "${namespace}" "${POD}" -- npx prisma migrate deploy
    
    log_info "Migrations complete!"
}

db_backup() {
    local namespace=$1
    local timestamp=$(date +%Y%m%d_%H%M%S)
    
    log_info "Creating database backup..."
    
    # Get postgres pod
    POD=$(kubectl get pods -n "${namespace}" -l app=hive-postgres -o jsonpath='{.items[0].metadata.name}')
    
    # Create backup
    kubectl exec -n "${namespace}" "${POD}" -- pg_dump -U hive hive > "backup_${timestamp}.sql"
    
    log_info "Backup saved to backup_${timestamp}.sql"
}

# =====================================================
# MONITORING
# =====================================================

port_forward() {
    log_info "Setting up port forwarding..."
    
    # Grafana
    kubectl port-forward svc/grafana -n monitoring 3000:3000 &
    log_info "Grafana: http://localhost:3000"
    
    # Prometheus
    kubectl port-forward svc/prometheus -n monitoring 9090:9090 &
    log_info "Prometheus: http://localhost:9090"
    
    # Alertmanager
    kubectl port-forward svc/alertmanager -n monitoring 9093:9093 &
    log_info "Alertmanager: http://localhost:9093"
    
    log_info "Port forwarding active. Press Ctrl+C to stop."
    wait
}

# =====================================================
# MAIN
# =====================================================

usage() {
    echo "HIVE Deployment CLI"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  deploy staging     Deploy to staging environment"
    echo "  deploy production  Deploy to production environment"
    echo "  rollback <env>     Rollback deployment"
    echo "  health <env>       Check deployment health"
    echo "  scale <env> <n>    Scale backend to n replicas"
    echo "  logs <env>         Stream logs"
    echo "  migrate <env>      Run database migrations"
    echo "  backup <env>       Create database backup"
    echo "  port-forward       Forward monitoring ports"
    echo ""
}

case "$1" in
    deploy)
        case "$2" in
            staging) deploy_staging ;;
            production) deploy_production ;;
            *) usage; exit 1 ;;
        esac
        ;;
    rollback)
        rollback "$2"
        ;;
    health)
        check_health "$2"
        ;;
    scale)
        scale "$2" "$3"
        ;;
    logs)
        logs "$2"
        ;;
    migrate)
        db_migrate "$2"
        ;;
    backup)
        db_backup "$2"
        ;;
    port-forward)
        port_forward
        ;;
    *)
        usage
        exit 1
        ;;
esac
