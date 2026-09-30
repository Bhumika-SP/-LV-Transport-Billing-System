-- CreateTable
CREATE TABLE `driver_earnings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `driver_id` INTEGER NOT NULL,
    `type` ENUM('ALLOWANCE', 'OTHER_EARNING') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `earning_date` DATE NOT NULL,
    `settlement_month` CHAR(7) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `status` ENUM('ACTIVE', 'VOID') NOT NULL DEFAULT 'ACTIVE',
    `void_reason` VARCHAR(500) NULL,
    `voided_at` DATETIME(3) NULL,
    `voided_by_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `driver_earnings_driver_id_settlement_month_idx`(`driver_id`, `settlement_month`),
    INDEX `driver_earnings_settlement_month_status_idx`(`settlement_month`, `status`),
    INDEX `driver_earnings_earning_date_idx`(`earning_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_adjustments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `driver_id` INTEGER NOT NULL,
    `type` ENUM('POSITIVE_ADJUSTMENT', 'OTHER_DEDUCTION') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `adjustment_date` DATE NOT NULL,
    `settlement_month` CHAR(7) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` ENUM('ACTIVE', 'VOID') NOT NULL DEFAULT 'ACTIVE',
    `void_reason` VARCHAR(500) NULL,
    `voided_at` DATETIME(3) NULL,
    `voided_by_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `driver_adjustments_driver_id_settlement_month_idx`(`driver_id`, `settlement_month`),
    INDEX `driver_adjustments_settlement_month_status_idx`(`settlement_month`, `status`),
    INDEX `driver_adjustments_adjustment_date_idx`(`adjustment_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `driver_earnings` ADD CONSTRAINT `driver_earnings_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_earnings` ADD CONSTRAINT `driver_earnings_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_earnings` ADD CONSTRAINT `driver_earnings_voided_by_id_fkey` FOREIGN KEY (`voided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_adjustments` ADD CONSTRAINT `driver_adjustments_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_adjustments` ADD CONSTRAINT `driver_adjustments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_adjustments` ADD CONSTRAINT `driver_adjustments_voided_by_id_fkey` FOREIGN KEY (`voided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
