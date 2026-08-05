import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LibraryItem } from './library-item.entity';
import { LibraryItemRepository } from './library-item.repository';
import { LibraryService } from './library.service';

@Module({
  imports: [TypeOrmModule.forFeature([LibraryItem])],
  providers: [LibraryItemRepository, LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
