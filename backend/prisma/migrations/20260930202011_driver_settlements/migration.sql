-- CreateTable
CREATE TABLE `driver_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `driver_id` INTEGER NOT NULL,
    `settlement_month` CHAR(7) NOT NULL,
    `status` ENUM('DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED') NOT NULL DEFAULT 'DRAFT',
    `payment_status` ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID') NULL,
    `trip_earnings` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `allowances` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `other_earnings` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `positive_adjustments` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `reimbursements` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `fuel` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `toll` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `maintenance` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `emi` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `advance_recovery` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `other_deductions` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `gross_earnings` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total_additions` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total_deductions` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `final_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `item_count` INTEGER NOT NULL DEFAULT 0,
    `calculation_hash` CHAR(64) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `reopen_count` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `calculated_at` DATETIME(3) NULL,
    `calculated_by_id` INTEGER NULL,
    `submitted_at` DATETIME(3) NULL,
    `submitted_by_id` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `approved_by_id` INTEGER NULL,
    `finalized_at` DATETIME(3) NULL,
    `finalized_by_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `driver_settlements_settlement_month_status_idx`(`settlement_month`, `status`),
    INDEX `driver_settlements_status_idx`(`status`),
    UNIQUE INDEX `driver_settlements_driver_id_settlement_month_key`(`driver_id`, `settlement_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_settlement_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `settlement_id` INTEGER NOT NULL,
    `component` ENUM('TRIP_EARNINGS', 'ALLOWANCE', 'OTHER_EARNING', 'POSITIVE_ADJUSTMENT', 'REIMBURSEMENT', 'FUEL', 'TOLL', 'MAINTENANCE', 'EMI', 'ADVANCE_RECOVERY', 'OTHER_DEDUCTION') NOT NULL,
    `direction` ENUM('ADD', 'DEDUCT') NOT NULL,
    `source_type` VARCHAR(30) NOT NULL,
    `source_id` INTEGER NOT NULL,
    `source_date` DATE NULL,
    `description` VARCHAR(500) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,

    INDEX `driver_settlement_items_settlement_id_component_idx`(`settlement_id`, `component`),
    INDEX `driver_settlement_items_source_type_source_id_idx`(`source_type`, `source_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_settlement_revisions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `settlement_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `reason` TEXT NOT NULL,
    `reopened_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `driver_settlement_revisions_settlement_id_version_key`(`settlement_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `driver_settlements` ADD CONSTRAINT `driver_settlements_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_settlements` ADD CONSTRAINT `driver_settlements_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_settlements` ADD CONSTRAINT `driver_settlements_calculated_by_id_fkey` FOREIGN KEY (`calculated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_settlements` ADD CONSTRAINT `driver_settlements_submitted_by_id_fkey` FOREIGN KEY (`submitted_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_settlements` ADD CONSTRAINT `driver_settlements_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_settlements` ADD CONSTRAINT `driver_settlements_finalized_by_id_fkey` FOREIGN KEY (`finalized_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_settlement_items` ADD CONSTRAINT `driver_settlement_items_settlement_id_fkey` FOREIGN KEY (`settlement_id`) REFERENCES `driver_settlements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_settlement_revisions` ADD CONSTRAINT `driver_settlement_revisions_settlement_id_fkey` FOREIGN KEY (`settlement_id`) REFERENCES `driver_settlements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_settlement_revisions` ADD CONSTRAINT `driver_settlement_revisions_reopened_by_id_fkey` FOREIGN KEY (`reopened_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
