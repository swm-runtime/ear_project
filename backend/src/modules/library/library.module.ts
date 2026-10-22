import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LibraryItem } from './library-item.entity';
import { LibraryItemRepository } from './library-item.repository';
import { LibrarySeries } from './library-series.entity';
import { LibrarySeriesRepository } from './library-series.repository';
import { LibrarySeriesService } from './library-series.service';
import { LibraryService } from './library.service';

@Module({
  imports: [TypeOrmModule.forFeature([LibraryItem, LibrarySeries])],
  providers: [
    LibraryItemRepository,
    LibraryService,
    LibrarySeriesRepository,
    LibrarySeriesService,
  ],
  exports: [LibraryService, LibrarySeriesService],
})
export class LibraryModule {}
