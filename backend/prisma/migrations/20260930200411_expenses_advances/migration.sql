-- CreateTable
CREATE TABLE `driver_expenses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `driver_id` INTEGER NOT NULL,
    `vehicle_id` INTEGER NOT NULL,
    `paid_by` ENUM('LV', 'DRIVER') NOT NULL,
    `category` ENUM('FUEL', 'TOLL', 'MAINTENANCE', 'EMI', 'OTHER') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `expense_date` DATE NOT NULL,
    `settlement_month` CHAR(7) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `receipt_reference` VARCHAR(100) NULL,
    `status` ENUM('ACTIVE', 'VOID') NOT NULL DEFAULT 'ACTIVE',
    `void_reason` VARCHAR(500) NULL,
    `voided_at` DATETIME(3) NULL,
    `voided_by_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `driver_expenses_driver_id_settlement_month_idx`(`driver_id`, `settlement_month`),
    INDEX `driver_expenses_vehicle_id_expense_date_idx`(`vehicle_id`, `expense_date`),
    INDEX `driver_expenses_expense_date_idx`(`expense_date`),
    INDEX `driver_expenses_settlement_month_paid_by_category_status_idx`(`settlement_month`, `paid_by`, `category`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_advances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `driver_id` INTEGER NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `advance_date` DATE NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `payment_method` ENUM('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE') NOT NULL,
    `reference_number` VARCHAR(100) NULL,
    `recovered_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `outstanding_amount` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('OPEN', 'RECOVERED', 'VOID') NOT NULL DEFAULT 'OPEN',
    `void_reason` VARCHAR(500) NULL,
    `voided_at` DATETIME(3) NULL,
    `voided_by_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `driver_advances_driver_id_status_idx`(`driver_id`, `status`),
    INDEX `driver_advances_advance_date_idx`(`advance_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `advance_recoveries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `advance_id` INTEGER NOT NULL,
    `driver_id` INTEGER NOT NULL,
    `settlement_month` CHAR(7) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `recovery_date` DATE NOT NULL,
    `notes` VARCHAR(500) NULL,
    `status` ENUM('ACTIVE', 'VOID') NOT NULL DEFAULT 'ACTIVE',
    `void_reason` VARCHAR(500) NULL,
    `voided_at` DATETIME(3) NULL,
    `voided_by_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `advance_recoveries_advance_id_idx`(`advance_id`),
    INDEX `advance_recoveries_driver_id_settlement_month_idx`(`driver_id`, `settlement_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `driver_expenses` ADD CONSTRAINT `driver_expenses_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_expenses` ADD CONSTRAINT `driver_expenses_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_expenses` ADD CONSTRAINT `driver_expenses_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_expenses` ADD CONSTRAINT `driver_expenses_voided_by_id_fkey` FOREIGN KEY (`voided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_advances` ADD CONSTRAINT `driver_advances_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_advances` ADD CONSTRAINT `driver_advances_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_advances` ADD CONSTRAINT `driver_advances_voided_by_id_fkey` FOREIGN KEY (`voided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advance_recoveries` ADD CONSTRAINT `advance_recoveries_advance_id_fkey` FOREIGN KEY (`advance_id`) REFERENCES `driver_advances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advance_recoveries` ADD CONSTRAINT `advance_recoveries_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advance_recoveries` ADD CONSTRAINT `advance_recoveries_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advance_recoveries` ADD CONSTRAINT `advance_recoveries_voided_by_id_fkey` FOREIGN KEY (`voided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
