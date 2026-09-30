-- CreateTable
CREATE TABLE `company_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `settlement_month` CHAR(7) NOT NULL,
    `expected_amount` DECIMAL(15, 2) NOT NULL,
    `received_amount` DECIMAL(15, 2) NULL,
    `status` ENUM('PENDING', 'RECEIVED') NOT NULL DEFAULT 'PENDING',
    `received_date` DATE NULL,
    `payment_method` ENUM('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE') NULL,
    `reference_number` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `created_by_id` INTEGER NULL,
    `received_by_id` INTEGER NULL,
    `received_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `company_settlements_settlement_month_idx`(`settlement_month`),
    INDEX `company_settlements_status_idx`(`status`),
    UNIQUE INDEX `company_settlements_company_id_settlement_month_key`(`company_id`, `settlement_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `company_settlements` ADD CONSTRAINT `company_settlements_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_settlements` ADD CONSTRAINT `company_settlements_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_settlements` ADD CONSTRAINT `company_settlements_received_by_id_fkey` FOREIGN KEY (`received_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
