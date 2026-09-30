-- CreateTable
CREATE TABLE `trips` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `driver_id` INTEGER NOT NULL,
    `vehicle_id` INTEGER NOT NULL,
    `vehicle_type_id` INTEGER NOT NULL,
    `trip_date` DATE NOT NULL,
    `settlement_month` CHAR(7) NOT NULL,
    `external_trip_id` VARCHAR(100) NULL,
    `trip_reference` VARCHAR(100) NULL,
    `pickup` VARCHAR(255) NULL,
    `drop_location` VARCHAR(255) NULL,
    `start_km` DECIMAL(12, 2) NULL,
    `end_km` DECIMAL(12, 2) NULL,
    `total_km` DECIMAL(12, 2) NOT NULL,
    `km_source` ENUM('START_END', 'DIRECT') NOT NULL,
    `rate_id` INTEGER NOT NULL,
    `rate_per_km` DECIMAL(10, 2) NOT NULL,
    `earnings` DECIMAL(15, 2) NOT NULL,
    `source` ENUM('MANUAL', 'IMPORT') NOT NULL DEFAULT 'MANUAL',
    `import_id` INTEGER NULL,
    `status` ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `cancel_reason` VARCHAR(500) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancelled_by_id` INTEGER NULL,
    `notes` TEXT NULL,
    `extra` JSON NULL,
    `created_by_id` INTEGER NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `trips_company_id_trip_date_idx`(`company_id`, `trip_date`),
    INDEX `trips_driver_id_trip_date_idx`(`driver_id`, `trip_date`),
    INDEX `trips_vehicle_id_trip_date_idx`(`vehicle_id`, `trip_date`),
    INDEX `trips_trip_date_idx`(`trip_date`),
    INDEX `trips_settlement_month_driver_id_idx`(`settlement_month`, `driver_id`),
    INDEX `trips_status_idx`(`status`),
    INDEX `trips_rate_id_idx`(`rate_id`),
    INDEX `trips_import_id_idx`(`import_id`),
    UNIQUE INDEX `trips_company_id_external_trip_id_key`(`company_id`, `external_trip_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_vehicle_type_id_fkey` FOREIGN KEY (`vehicle_type_id`) REFERENCES `vehicle_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_rate_id_fkey` FOREIGN KEY (`rate_id`) REFERENCES `vehicle_type_rates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_cancelled_by_id_fkey` FOREIGN KEY (`cancelled_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
