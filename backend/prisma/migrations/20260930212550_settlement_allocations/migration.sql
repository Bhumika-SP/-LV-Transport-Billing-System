-- CreateTable
CREATE TABLE `driver_settlement_allocations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `settlement_id` INTEGER NOT NULL,
    `company_id` INTEGER NULL,
    `settlement_month` CHAR(7) NOT NULL,
    `trip_earnings` DECIMAL(15, 2) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `driver_settlement_allocations_settlement_month_company_id_idx`(`settlement_month`, `company_id`),
    UNIQUE INDEX `driver_settlement_allocations_settlement_id_company_id_key`(`settlement_id`, `company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `driver_settlement_allocations` ADD CONSTRAINT `driver_settlement_allocations_settlement_id_fkey` FOREIGN KEY (`settlement_id`) REFERENCES `driver_settlements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_settlement_allocations` ADD CONSTRAINT `driver_settlement_allocations_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
