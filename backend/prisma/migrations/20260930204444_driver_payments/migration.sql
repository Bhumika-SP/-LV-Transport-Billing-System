-- CreateTable
CREATE TABLE `driver_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `settlement_id` INTEGER NOT NULL,
    `driver_id` INTEGER NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `payment_date` DATE NOT NULL,
    `payment_method` ENUM('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE') NOT NULL,
    `reference_number` VARCHAR(100) NULL,
    `notes` VARCHAR(500) NULL,
    `proof_reference` VARCHAR(255) NULL,
    `status` ENUM('VALID', 'REVERSED') NOT NULL DEFAULT 'VALID',
    `reversal_reason` VARCHAR(500) NULL,
    `reversed_at` DATETIME(3) NULL,
    `reversed_by_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `driver_payments_settlement_id_status_idx`(`settlement_id`, `status`),
    INDEX `driver_payments_driver_id_payment_date_idx`(`driver_id`, `payment_date`),
    INDEX `driver_payments_payment_date_idx`(`payment_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `driver_payments` ADD CONSTRAINT `driver_payments_settlement_id_fkey` FOREIGN KEY (`settlement_id`) REFERENCES `driver_settlements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_payments` ADD CONSTRAINT `driver_payments_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_payments` ADD CONSTRAINT `driver_payments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_payments` ADD CONSTRAINT `driver_payments_reversed_by_id_fkey` FOREIGN KEY (`reversed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
