import { Module } from '@nestjs/common';
import { SearchController, EmbeddingController } from './search.controller';
import { SearchService } from './search.service';
import { EmbeddingService } from './embedding.service';

@Module({
  controllers: [SearchController, EmbeddingController],
  providers: [SearchService, EmbeddingService],
  exports: [SearchService, EmbeddingService],
})
export class SearchModule {}
