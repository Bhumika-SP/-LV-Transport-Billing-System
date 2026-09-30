-- CreateTable
CREATE TABLE `tax_rate_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hsn_sac` VARCHAR(10) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `gst_rate` DECIMAL(5, 2) NOT NULL,
    `cess_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tax_rate_configs_hsn_sac_effective_from_idx`(`hsn_sac`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gst_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `direction` ENUM('OUTWARD', 'INWARD') NOT NULL,
    `company_id` INTEGER NULL,
    `counterparty_name` VARCHAR(150) NOT NULL,
    `counterparty_gstin` VARCHAR(15) NULL,
    `counterparty_key` VARCHAR(15) NOT NULL DEFAULT '',
    `invoice_number` VARCHAR(50) NOT NULL,
    `invoice_date` DATE NOT NULL,
    `tax_period` CHAR(7) NOT NULL,
    `hsn_sac` VARCHAR(10) NOT NULL,
    `description` VARCHAR(255) NULL,
    `taxable_value` DECIMAL(15, 2) NOT NULL,
    `tax_rate` DECIMAL(5, 2) NOT NULL,
    `cess_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `supply_type` ENUM('INTRA_STATE', 'INTER_STATE') NOT NULL,
    `place_of_supply` CHAR(2) NOT NULL,
    `reverse_charge` BOOLEAN NOT NULL DEFAULT false,
    `cgst` DECIMAL(15, 2) NOT NULL,
    `sgst` DECIMAL(15, 2) NOT NULL,
    `igst` DECIMAL(15, 2) NOT NULL,
    `cess` DECIMAL(15, 2) NOT NULL,
    `total_tax` DECIMAL(15, 2) NOT NULL,
    `invoice_value` DECIMAL(15, 2) NOT NULL,
    `tax_rate_config_id` INTEGER NULL,
    `notes` TEXT NULL,
    `status` ENUM('ACTIVE', 'VOID') NOT NULL DEFAULT 'ACTIVE',
    `void_reason` VARCHAR(500) NULL,
    `voided_at` DATETIME(3) NULL,
    `voided_by_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `gst_records_tax_period_direction_status_idx`(`tax_period`, `direction`, `status`),
    INDEX `gst_records_company_id_tax_period_idx`(`company_id`, `tax_period`),
    INDEX `gst_records_hsn_sac_idx`(`hsn_sac`),
    UNIQUE INDEX `gst_records_direction_counterparty_key_invoice_number_key`(`direction`, `counterparty_key`, `invoice_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tax_rate_configs` ADD CONSTRAINT `tax_rate_configs_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gst_records` ADD CONSTRAINT `gst_records_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gst_records` ADD CONSTRAINT `gst_records_tax_rate_config_id_fkey` FOREIGN KEY (`tax_rate_config_id`) REFERENCES `tax_rate_configs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gst_records` ADD CONSTRAINT `gst_records_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gst_records` ADD CONSTRAINT `gst_records_voided_by_id_fkey` FOREIGN KEY (`voided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
