.PHONY: start stop restart logs clean help

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

start: ## Start all services with Docker Compose
	@./start.sh

stop: ## Stop all services
	@./stop.sh

restart: ## Restart all services
	@./restart.sh

logs: ## View logs from all services
	docker-compose logs -f

logs-backend: ## View backend logs
	docker-compose logs -f backend

logs-frontend: ## View frontend logs
	docker-compose logs -f frontend

logs-db: ## View database logs
	docker-compose logs -f postgres

build: ## Build Docker images
	docker-compose build

up: ## Start services without building
	docker-compose up -d

down: ## Stop and remove containers
	docker-compose down

clean: ## Stop containers and remove volumes
	docker-compose down -v
	rm -rf backend/uploads/*

ps: ## Show running containers
	docker-compose ps

shell-backend: ## Open shell in backend container
	docker-compose exec backend /bin/bash

shell-frontend: ## Open shell in frontend container
	docker-compose exec frontend /bin/sh

shell-db: ## Open PostgreSQL shell
	docker-compose exec postgres psql -U postgres -d sheetpilot

