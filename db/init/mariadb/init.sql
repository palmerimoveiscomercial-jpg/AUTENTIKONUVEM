-- Exemplo de inicialização para MariaDB
-- Cria tabela simples de exemplo

CREATE DATABASE IF NOT EXISTS app_db;
USE app_db;

CREATE TABLE IF NOT EXISTS users_mariadb (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO users_mariadb (email, name) VALUES ('user@example.com', 'Usuário MariaDB')
ON DUPLICATE KEY UPDATE email = email;
